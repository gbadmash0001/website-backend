require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit'); // ✅ Add the rate limit module
const { body, validationResult } = require('express-validator');
const { userLogger, errorLogger } = require('./logger'); // ✅ Import your loggers
const app = express();
const PORT = 3000;
// Enable CORS for frontend access
app.use(cors({
  origin: 'http://localhost:3000', // 🔁 during development
  credentials: true               // if you're using cookies or sessions
}));


// Middleware to parse JSON bodies
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublicKey = process.env.SUPABASE_PUBLIC_KEY;
const supabase = createClient(supabaseUrl, supabasePublicKey);


// ✅ Rate limiting middleware
const userLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 50,                    // limit to 50 requests per IP
  message: 'Too many signup attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use(userLimiter); // ✅ Apply limiter globally to user routes

const extractToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No access token provided' });
  }
  req.accessToken = authHeader.split(' ')[1];
  next();
};



// Serve static assets like CSS, JS, images from 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Static HTML routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/wallet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wallet.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/add-money', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'add-money.html'));
});

app.get('/withdraw', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'withdraw.html'));
});

app.get('/join-tournament', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join-tournament.html'));
});

app.get('/notifications', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'notifications.html'));
});


// --- You will add API routes here later ---
// POST signup route
app.post('/api/signup', [
  authLimiter,

  // 🛡️ Validation & Sanitization Middleware
  body('mobile')
    .trim()
    .isLength({ min: 10, max: 10 }).withMessage('Mobile must be 10 digits')
    .isNumeric().withMessage('Mobile must contain digits only'),

  body('username')
    .trim()
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters')
    .escape(),

  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),

  body('uid')
    .trim()
    .isLength({ min: 6 }).withMessage('UID must be at least 6 characters')
    .escape()
],
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    errorLogger.warn('[Signup] Validation errors: ' + JSON.stringify(errors.array()));
    return res.status(422).json({ errors: errors.array() });
  }

  const { mobile, username, password, uid } = req.body;
  const email = `u.${mobile}@fakefire.com`;

  try {
    // 🔐 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, uid, mobile }
      }
    });

    if (authError) {
      errorLogger.error(`[Signup] Auth error for ${mobile}: ${authError.message}`);
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // 🗃️ 2. Insert into users table
    const { error: dbError } = await supabase
      .from('users')
      .insert([{ id: userId, mobile, username, uid, wallet_balance: 0 }]);

    if (dbError) {
      errorLogger.error(`[Signup] DB error for ${userId}: ${dbError.message}`);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: dbError.message });
    }

    // 👤 3. Insert into profiles table
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([{ id: userId, mobile, username, uid }]);

    if (profileError) {
      errorLogger.error(`[Signup] Profile error for ${userId}: ${profileError.message}`);
      await supabase.auth.admin.deleteUser(userId);
      await supabase.from('users').delete().eq('id', userId);
      return res.status(400).json({ error: profileError.message });
    }

    // ✅ 4. Log and return created user summary
    userLogger.info(`[Signup] New user registered: ${userId} (mobile: ${mobile}, username: ${username})`);

    return res.status(200).json({
      user: { id: userId, mobile, username, uid, wallet_balance: 0 }
    });

  } catch (err) {
    errorLogger.error(`[Signup] Server crash: ${err.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST login route
app.post('/api/login', [
  authLimiter,

  // 🧼 Validation Middleware
  body('mobile')
    .trim()
    .isLength({ min: 10, max: 10 }).withMessage('Mobile number must be 10 digits')
    .isNumeric().withMessage('Mobile must contain digits only'),

  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
],
async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    errorLogger.warn('[Login] Validation failed: ' + JSON.stringify(errors.array()));
    return res.status(422).json({ errors: errors.array() });
  }

  const { mobile, password } = req.body;
  const email = `u.${mobile}@fakefire.com`;

  try {
    // 🔐 Step 1: Authenticate with Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.user) {
      userLogger.warn(`[Login] Failed login attempt for mobile: ${mobile}`);
      return res.status(401).json({ error: 'Invalid mobile number or password' });
    }

    const userId = authData.user.id;

    // 👤 Step 2: Fetch user profile
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('id, mobile, username, uid, wallet_balance')
      .eq('id', userId)
      .single();

    if (dbError || !userData) {
      errorLogger.error(`[Login] Profile fetch failed for user ${userId}: ${dbError?.message || 'No data'}`);
      return res.status(404).json({ error: 'User profile not found' });
    }

    // 🎉 Step 3: Log success and respond
    userLogger.info(`[Login] User logged in: ${userId} (mobile: ${mobile})`);

    return res.status(200).json({
      message: 'Login successful',
      token: authData.session.access_token,
      user: userData
    });

  } catch (err) {
    errorLogger.error(`[Login] Server error: ${err.message}`);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Wallet route
app.get('/api/wallet', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // ✅ Get user from token
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      errorLogger.warn(`[Wallet] Invalid or expired token used`);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // ✅ Fetch wallet balance for logged-in user
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', userId)
      .single();

    if (dbError || !userData) {
      errorLogger.error(`[Wallet] Balance fetch failed for user ${userId}: ${dbError?.message || 'No user data'}`);
      return res.status(404).json({ error: 'User wallet balance not found' });
    }

    userLogger.info(`[Wallet] Wallet balance retrieved for user ${userId}: ₹${userData.wallet_balance || 0}`);

    res.json({ wallet_balance: userData.wallet_balance || 0 });

  } catch (err) {
    errorLogger.error(`[Wallet] Server error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Profile route
app.get('/api/profile', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // 🔐 Verify the token and extract user ID
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);

    if (tokenError || !user) {
      errorLogger.warn('[Profile] Invalid or expired token used');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // ✅ Fetch profile based on authenticated user ID
    const { data, error } = await supabase
      .from('profiles')
      .select('mobile, uid, username')
      .eq('id', userId)
      .single();

    if (error) {
      errorLogger.error(`[Profile] Fetch failed for user ${userId}: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    userLogger.info(`[Profile] Profile fetched for user ${userId}`);
    res.json(data);

  } catch (err) {
    errorLogger.error(`[Profile] Server error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/deposits/pending?userId=...
app.get('/api/deposits/pending', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // 🔐 Validate token and get user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      errorLogger.warn('[Deposits] Invalid or expired token used on pending check');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // ✅ Fetch pending deposits for the authenticated user
    const { data, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      errorLogger.error(`[Deposits] Failed to fetch pending deposits for ${userId}: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    userLogger.info(`[Deposits] Pending deposit status checked for user ${userId} — ${data.length > 0 ? 'Pending exists' : 'No pending deposits'}`);
    res.json({ pending: data.length > 0 });

  } catch (err) {
    errorLogger.error(`[Deposits] Server error during pending check: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/deposits
app.post('/api/deposits', [
  extractToken,

  // ✅ Validation Middleware
  body('amount')
    .isFloat({ min: 20 })
    .withMessage('Minimum deposit amount is ₹20')
],
async (req, res) => {
  const token = req.accessToken;

  // ⛔ Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    errorLogger.warn('[Deposit] Validation failed: ' + JSON.stringify(errors.array()));
    return res.status(422).json({ errors: errors.array() });
  }

  const { amount } = req.body;

  try {
    // 🔐 Verify token and extract user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      errorLogger.warn('[Deposit] Invalid or expired token used');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // 🚫 Check for existing pending deposits
    const { data: pending, error: pendingError } = await supabase
      .from('deposits')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (pendingError) {
      errorLogger.error(`[Deposit] Pending check failed for ${userId}: ${pendingError.message}`);
      return res.status(500).json({ error: pendingError.message });
    }

    if (pending.length > 0) {
      userLogger.warn(`[Deposit] Duplicate attempt — user ${userId} already has a pending deposit`);
      return res.status(400).json({ error: 'You already have a pending deposit request' });
    }

    // 💰 Create deposit entry
    const { error: depositErr } = await supabase.from('deposits').insert([{
      user_id: userId,
      amount,
      status: 'pending',
      created_at: new Date().toISOString()
    }]);

    if (depositErr) {
      errorLogger.error(`[Deposit] Insert failed for ${userId}: ${depositErr.message}`);
      return res.status(500).json({ error: depositErr.message });
    }

    // 📩 Optional notification
    const { error: notificationErr } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        message: `Your deposit request of ₹${amount} has been submitted. Please wait for admin approval.`,
        date: new Date().toISOString()
      }]);

    if (notificationErr) {
      errorLogger.warn(`[Deposit] Notification insert failed for ${userId}: ${notificationErr.message}`);
      // Proceed anyway
    }

    userLogger.info(`[Deposit] New deposit submitted by user ${userId}: ₹${amount}`);
    res.json({ message: 'Deposit request created successfully' });

  } catch (err) {
    errorLogger.error(`[Deposit] Server crash for user ${req.body?.userId || 'unknown'}: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/withdrawals/pending
app.get('/api/withdrawals/pending', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // ✅ Validate the access token
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);

    if (tokenError || !user) {
      errorLogger.warn('[Withdrawals] Invalid or expired token used on pending check');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // ✅ Fetch pending withdrawals securely
    const { data, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (error) {
      errorLogger.error(`[Withdrawals] Pending fetch failed for ${userId}: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    const hasPending = data.length > 0;
    userLogger.info(`[Withdrawals] Pending withdrawal check for ${userId}: ${hasPending ? 'YES' : 'NO'}`);
    res.json({ pending: hasPending });

  } catch (err) {
    errorLogger.error(`[Withdrawals] Server crash during pending check: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/withdrawals
app.post('/api/withdrawals', [
  extractToken,

  // 🛡️ Validation Middleware
  body('amount')
    .isFloat({ min: 20, max: 300 })
    .withMessage('Amount must be between ₹20 and ₹300'),

  body('upi_number')
    .matches(/^\d{10}$/)
    .withMessage('UPI number must be a valid 10-digit mobile number')
],
async (req, res) => {
  const token = req.accessToken;

  // ⛔ Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    errorLogger.warn('[Withdrawals] Validation failed: ' + JSON.stringify(errors.array()));
    return res.status(422).json({ errors: errors.array() });
  }

  const { amount, upi_number } = req.body;

  try {
    // 🔐 Verify token and extract user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      errorLogger.warn('[Withdrawals] Invalid or expired token used');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // 🚫 Check for pending withdrawal
    const { data: pending, error: pendingError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (pendingError) {
      errorLogger.error(`[Withdrawals] Pending check failed for ${userId}: ${pendingError.message}`);
      return res.status(500).json({ error: pendingError.message });
    }

    if (pending.length > 0) {
      userLogger.warn(`[Withdrawals] Duplicate request — user ${userId} already has a pending withdrawal`);
      return res.status(400).json({ error: 'You already have a pending withdrawal request' });
    }

    // 💸 Insert new withdrawal
    const { error: withdrawalErr } = await supabase
      .from('withdrawals')
      .insert([{
        user_id: userId,
        amount,
        upi_number,
        status: 'pending',
        created_at: new Date().toISOString()
      }]);

    if (withdrawalErr) {
      errorLogger.error(`[Withdrawals] Insert failed for ${userId}: ${withdrawalErr.message}`);
      return res.status(500).json({ error: withdrawalErr.message });
    }

    // 🔔 Notify the user
    const { error: notificationErr } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        message: `Your withdrawal request of ₹${amount} has been submitted. Please wait for admin approval.`,
        date: new Date().toISOString()
      }]);

    if (notificationErr) {
      errorLogger.warn(`[Withdrawals] Notification failed for ${userId}: ${notificationErr.message}`);
    }

    userLogger.info(`[Withdrawals] Withdrawal submitted by ${userId}: ₹${amount}`);
    res.json({ message: 'Withdrawal request created successfully' });

  } catch (err) {
    errorLogger.error(`[Withdrawals] Server crash for user ${req.body?.userId || 'unknown'}: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tournaments/pending?userId=...
app.get('/api/tournaments/pending', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // 🔐 Get user from token
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);
    if (tokenError || !user) {
      errorLogger.warn('[Tournaments] Invalid or expired token used for pending check');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // 🎯 Check if user is registered in any pending tournaments
    const { data, error } = await supabase
      .from('tournament_registrations')
      .select('*')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .eq('status', 'pending');

    if (error) {
      errorLogger.error(`[Tournaments] Supabase query failed for user ${userId}: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    const hasPending = data.length > 0;
    userLogger.info(`[Tournaments] Pending status checked for user ${userId}: ${hasPending ? 'PENDING' : 'NONE'}`);
    res.json({ pending: hasPending });

  } catch (err) {
    errorLogger.error(`[Tournaments] Server crash during pending check: ${err.message}`);
    res.status(500).json({ error: 'Unexpected server error' });
  }
});

// POST /api/tournaments/join
app.post('/api/tournaments/join', [
  extractToken,

  // 🎯 Validation
  body('match_type')
    .isInt({ min: 1, max: 4 })
    .withMessage('Match type must be an integer between 1 and 4'),

  body('entry_fee')
    .isFloat({ min: 1 })
    .withMessage('Entry fee must be a positive number')
],
async (req, res) => {
  const token = req.accessToken;
  const errors = validationResult(req);

  // 🧼 Check for validation issues
  if (!errors.isEmpty()) {
    errorLogger.warn('[Tournaments] Validation failed: ' + JSON.stringify(errors.array()));
    return res.status(422).json({ errors: errors.array() });
  }

  const { match_type, entry_fee } = req.body;

  try {
    // 🔐 Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      errorLogger.warn('[Tournaments] Invalid or expired token');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // 💰 Fetch wallet
    const { data: userData, error: fetchErr } = await supabase
      .from("users")
      .select("wallet_balance")
      .eq("id", userId)
      .single();

    if (fetchErr || !userData) {
      errorLogger.error(`[Tournaments] Wallet fetch failed for ${userId}: ${fetchErr?.message}`);
      return res.status(404).json({ error: 'User not found or wallet access failed' });
    }

    if (userData.wallet_balance < entry_fee) {
      userLogger.warn(`[Tournaments] Insufficient balance for ${userId}. Entry: ₹${entry_fee}, Wallet: ₹${userData.wallet_balance}`);
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    // 🎮 Find open match or create one
    const { data: pendingMatch, error: pendingError } = await supabase
      .from('tournament_registrations')
      .select('id, player1_id')
      .eq('match_type', match_type)
      .eq('entry_fee', entry_fee)
      .eq('status', 'pending')
      .limit(1);

    if (pendingError) throw pendingError;

    let matchStatus = 'pending';

    if (pendingMatch.length) {
      const matchId = pendingMatch[0].id;
      const player1Id = pendingMatch[0].player1_id;

      const { error: updateError } = await supabase
        .from('tournament_registrations')
        .update({
          player2_id: userId,
          status: 'matched'
        })
        .eq('id', matchId);

      if (updateError) throw updateError;

      matchStatus = 'matched';

      await supabase.from('notifications').insert([{
        user_id: player1Id,
        message: `An opponent has joined your ₹${entry_fee} tournament match. Get ready to play!`,
        date: new Date().toISOString()
      }]);
    } else {
      const { error: insertError } = await supabase
        .from('tournament_registrations')
        .insert([{
          player1_id: userId,
          match_type,
          entry_fee,
          reward: entry_fee * 1.8,
          status: 'pending',
          created_at: new Date().toISOString()
        }]);

      if (insertError) throw insertError;
    }

    // 💳 Deduct balance
    const newBalance = userData.wallet_balance - entry_fee;

    const { error: balanceErr } = await supabase
      .from('users')
      .update({ wallet_balance: newBalance })
      .eq("id", userId);

    if (balanceErr) throw balanceErr;

    const joinMessage = matchStatus === 'matched'
      ? `You’ve been matched for a ₹${entry_fee} tournament. Good luck!`
      : `You’ve joined a ₹${entry_fee} tournament. Waiting for an opponent...`;

    await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        message: joinMessage,
        date: new Date().toISOString()
      }]);

    userLogger.info(`[Tournaments] ${matchStatus.toUpperCase()} — ${userId} joined ₹${entry_fee} match`);

    res.json({
      message: matchStatus === 'matched'
        ? 'Matched with another player! Admin will send you room code shortly'
        : 'Tournement join request added. Waiting for an opponent to join your requested match...'
    });

  } catch (err) {
    errorLogger.error(`[Tournaments] Join crash for ${req.body?.userId || 'unknown'}: ${err.message}`);
    res.status(500).json({ error: 'Tournament registration failed' });
  }
});

// GET /api/notifications - Get notifications for logged-in user
app.get('/api/notifications', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // 🔐 Verify token and extract user
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);

    if (tokenError || !user) {
      errorLogger.warn('[Notifications] Invalid or expired token used');
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // 📥 Fetch latest 20 user-specific + global notifications
    const { data, error } = await supabase
      .from('notifications')
      .select('message, date')
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order('date', { ascending: false })
      .limit(20);

    if (error) {
      errorLogger.error(`[Notifications] Supabase query failed for ${userId}: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    userLogger.info(`[Notifications] Fetched ${data?.length || 0} notifications for ${userId}`);
    res.json({
      success: true,
      notifications: data || []
    });

  } catch (err) {
    errorLogger.error(`[Notifications] Unexpected error for token ${token?.slice(0, 10) || 'n/a'}: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/notifications/unread-count', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // 🔐 Authenticate and extract user
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);
    if (tokenError || !user) {
      errorLogger.warn('[Notifications] Invalid or expired token used for unread count');
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // 🔢 Count unread notifications for this user
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      errorLogger.error(`[Notifications] Unread count query failed for ${userId}: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    userLogger.info(`[Notifications] Unread count checked for ${userId}: ${count || 0} unread`);
    res.json({ success: true, count: count || 0 });

  } catch (err) {
    errorLogger.error(`[Notifications] Crash during unread count for token ${token?.slice(0, 10) || 'n/a'}: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.post('/api/notifications/mark-all-read', extractToken, async (req, res) => {
  const token = req.accessToken;

  try {
    // 🔐 Authenticate and extract user
    const { data: { user }, error: tokenError } = await supabase.auth.getUser(token);
    if (tokenError || !user) {
      errorLogger.warn('[Notifications] Invalid or expired token used during mark-all-read');
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const userId = user.id;

    // ✅ Mark all unread notifications as read for this user
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      errorLogger.error(`[Notifications] Failed to mark notifications read for ${userId}: ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    userLogger.info(`[Notifications] All notifications marked as read for ${userId}`);
    res.json({ success: true, message: 'All notifications marked as read' });

  } catch (err) {
    errorLogger.error(`[Notifications] Server error during mark-all-read for token ${token?.slice(0, 10)}: ${err.message}`);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});





app.post('/api/format-date', (req, res) => {
  const { timestamp } = req.body;

  try {
    if (!timestamp) {
      errorLogger.warn('[FormatDate] Missing timestamp in request body');
      throw new Error('Timestamp is required');
    }

    const options = {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };

    const date = new Date(`${timestamp}Z`);
    const formatted = new Intl.DateTimeFormat('en-IN', options).format(date);

    userLogger.info(`[FormatDate] Timestamp ${timestamp} formatted as "${formatted}"`);
    res.json({ formatted });

  } catch (err) {
    errorLogger.error(`[FormatDate] Failed to format timestamp "${timestamp}": ${err.message}`);
    res.status(400).json({ error: 'Invalid timestamp' });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
