require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { body, validationResult } = require('express-validator');
const { adminLogger, adminErrorLogger } = require('./logger');
const app = express();
const PORT = process.env.PORT || 3000;
// Enable CORS for frontend access
app.use(cors({
  origin: 'https://magnificent-brigadeiros-ab48cb.netlify.app',
  credentials: true
}));

// Middleware to parse JSON bodies
app.use(express.json());


const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);


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
app.get('/admin-signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-signup.html'));
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

app.get('/admin-wallet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-wallet.html'));
});

app.get('/admin-transaction-history', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-transaction-history.html'));
});

app.get('/admin-deposit-requests', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-deposit-requests.html'));
});

app.get('/admin-withdrawal-requests', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-withdrawal-requests.html'));
});

app.get('/admin-tournament-management', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-tournament-management.html'));
});

app.get('/admin-users-list', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-users-list.html'));
});

app.get('/admin-send-notification', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-send-notification.html'));
});


// POST admin signup
app.post('/api/admin/signup', [
  body('mobile')
    .trim()
    .isLength({ min: 10, max: 10 }).withMessage('Mobile must be 10 digits')
    .isNumeric().withMessage('Mobile should contain only numbers'),

  body('username')
    .trim()
    .isLength({ min: 3 }).withMessage('Username must be at least 3 characters')
    .escape(),

  body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[SIGNUP_FAIL_VALIDATION] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { mobile, username, password } = req.body;
  const syntheticEmail = `${mobile}@admin.com`;

  try {
    const { data: adminCount, error: countError } = await supabase
      .from('admins')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      adminErrorLogger.error(`[COUNT_FAIL] ${countError.message}`);
      return res.status(500).json({ error: 'Admin limit check failed' });
    }

    if (adminCount && adminCount.length >= 1) {
      adminLogger.info(`[SIGNUP_BLOCKED] Admin already exists`);
      return res.status(403).json({ error: 'Admin already exists. Signup locked.' });
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: syntheticEmail,
      password
    });

    if (authError || !authData.user) {
      adminErrorLogger.error(`[AUTH_FAIL] ${authError?.message}`);
      return res.status(400).json({ error: 'Signup failed. Try different mobile.' });
    }

    const { error: insertError } = await supabase
      .from('admins')
      .insert([{
        username,
        mobile,
        auth_uid: authData.user.id
      }]);

    if (insertError) {
      adminErrorLogger.error(`[DB_INSERT_FAIL] ${insertError.message}`);
      return res.status(500).json({ error: 'Signup succeeded, but admin data failed.' });
    }

    adminLogger.info(`[SIGNUP_SUCCESS] Mobile: ${mobile}, UID: ${authData.user.id}`);
    res.status(201).json({ message: 'Admin signup successful.' });

  } catch (err) {
    adminErrorLogger.error(`[UNEXPECTED_ERROR] ${err.message}`);
    res.status(500).json({ error: 'Server error during signup.' });
  }
});

// Post admin login
app.post('/api/admin/login', [
  body('username')
    .trim()
    .notEmpty().withMessage('Username is required')
    .isEmail().withMessage('Username must be a valid email'),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[LOGIN_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { username, password } = req.body;

  try {
    const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
      email: username,
      password
    });

    if (loginError) {
      adminLogger.warn(`[LOGIN_FAIL] Invalid credentials for ${username}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('username, mobile')
      .eq('auth_uid', sessionData.user.id)
      .single();

    if (adminError || !adminData) {
      adminErrorLogger.error(`[LOGIN_AUTH_UID_MISSING] UID: ${sessionData.user.id}, ${adminError?.message}`);
      return res.status(404).json({ error: 'Admin record not found' });
    }

    adminLogger.info(`[LOGIN_SUCCESS] Admin: ${adminData.username}, Mobile: ${adminData.mobile}`);
    res.json({
      message: 'Login successful',
      username: adminData.username,
      access_token: sessionData.session.access_token
    });

  } catch (err) {
    adminErrorLogger.error(`[LOGIN_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get admin wallet balance
app.get('/api/admin/wallet', extractToken, async (req, res) => {
  const { data: user, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[WALLET_AUTH_FAIL] Invalid or expired token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { data, error } = await supabase
      .from('admin_wallet')
      .select('balance')
      .eq('id', 1)
      .single();

    if (error) {
      adminErrorLogger.error(`[WALLET_DB_ERROR] ${error.message}`);
      throw error;
    }

    adminLogger.info(`[WALLET_ACCESS] Admin UID: ${user.id} checked balance`);
    res.json({ balance: data.balance });

  } catch (err) {
    adminErrorLogger.error(`[WALLET_FETCH_FAIL] ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Update wallet balance (add/deduct)
app.post('/api/admin/wallet/update', [
  extractToken,

  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),

  body('action')
    .trim()
    .isIn(['add', 'deduct']).withMessage('Action must be either "add" or "deduct"')
], async (req, res) => {
  const { data: user, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[WALLET_UPDATE_UNAUTHORIZED] Invalid or expired token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[WALLET_UPDATE_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { amount, action } = req.body;

  try {
    const { data, error: fetchError } = await supabase
      .from('admin_wallet')
      .select('balance')
      .eq('id', 1)
      .single();

    if (fetchError) {
      adminErrorLogger.error(`[WALLET_FETCH_ERROR] ${fetchError.message}`);
      return res.status(500).json({ error: 'Could not retrieve wallet balance' });
    }

    let newBalance = action === 'add'
      ? data.balance + amount
      : data.balance - amount;

    if (newBalance < 0) {
      adminLogger.warn(`[WALLET_UPDATE_BLOCKED] Attempted overdraft by UID: ${user.id}`);
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const { error: updateError } = await supabase
      .from('admin_wallet')
      .upsert({ id: 1, balance: newBalance }, { onConflict: 'id' });

    if (updateError) {
      adminErrorLogger.error(`[WALLET_UPDATE_FAIL] ${updateError.message}`);
      return res.status(500).json({ error: 'Failed to update wallet balance' });
    }

    const description = action === 'add'
      ? 'Used Add button'
      : 'Used Deduct button';

    const { error: insertError } = await supabase
      .from('admin_transactions')
      .insert([{
        amount,
        type: action === 'add' ? 'deposit' : 'withdrawal',
        date: new Date().toISOString(),
        description
      }]);

    if (insertError) {
      adminErrorLogger.error(`[WALLET_LOG_INSERT_FAIL] ${insertError.message}`);
      return res.status(500).json({ error: 'Balance updated, but failed to log transaction' });
    }

    adminLogger.info(`[WALLET_UPDATED] UID: ${user.id}, Action: ${action}, Amount: ${amount}, NewBalance: ${newBalance}`);
    res.json({ newBalance });

  } catch (err) {
    adminErrorLogger.error(`[WALLET_UPDATE_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

// Fetch admin transaction history
app.get('/api/admin/transactions', extractToken, async (req, res) => {
  const { data: user, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[TXN_FETCH_UNAUTHORIZED] Invalid or missing token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { data, error } = await supabase
      .from('admin_transactions')
      .select('id, amount, type, date, description')
      .order('date', { ascending: false });

    if (error) {
      adminErrorLogger.error(`[TXN_DB_ERROR] ${error.message}`);
      return res.status(500).json({ error: 'Failed to fetch transactions' });
    }

    adminLogger.info(`[TXN_FETCH_SUCCESS] UID: ${user.id} retrieved ${data.length} transactions`);
    res.json({ success: true, transactions: data || [] });

  } catch (err) {
    adminErrorLogger.error(`[TXN_FETCH_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all deposit requests (pending only)
app.get('/api/admin/deposit-requests', extractToken, async (req, res) => {
  const { data: user, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[DEPOSIT_REQ_UNAUTHORIZED] Token invalid or missing`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { data, error } = await supabase
      .from('deposits')
      .select(`
        id,
        amount,
        created_at,
        status,
        user_id,
        users (
          id,
          mobile
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      adminErrorLogger.error(`[DEPOSIT_REQ_DB_FAIL] ${error.message}`);
      throw error;
    }

    adminLogger.info(`[DEPOSIT_REQ_SUCCESS] UID: ${user.id} fetched ${data.length} pending deposit(s)`);
    res.json(data);
    
  } catch (err) {
    adminErrorLogger.error(`[DEPOSIT_REQ_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch deposit requests' });
  }
});

// Approve a deposit request
app.post('/api/admin/approve-deposit', [
  extractToken,
  body('depositId').notEmpty().isInt({ gt: 0 }),
  body('userId').notEmpty().isString({ gt: 0 }),
  body('amount').notEmpty().isFloat({ gt: 0 })
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[APPROVE_UNAUTHORIZED] Token invalid or missing`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[APPROVE_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { depositId, userId, amount } = req.body;

  try {
    const { data: deposit, error: depositCheckErr } = await supabase
      .from('deposits')
      .select('status')
      .eq('id', depositId)
      .single();

    if (depositCheckErr || !deposit) {
      adminErrorLogger.error(`[APPROVE_DEPOSIT_FETCH_FAIL] ID: ${depositId} — ${depositCheckErr?.message}`);
      throw new Error('Deposit not found');
    }

    if (deposit.status !== 'pending') {
      adminLogger.warn(`[APPROVE_ALREADY_PROCESSED] ID: ${depositId}, Status: ${deposit.status}`);
      return res.status(400).json({ error: 'This deposit has already been processed.' });
    }

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('wallet_balance, username, mobile')
      .eq('id', userId)
      .single();

    if (userErr || !user) {
      adminErrorLogger.error(`[APPROVE_USER_FETCH_FAIL] UID: ${userId} — ${userErr?.message}`);
      throw new Error('User not found');
    }

    const { error: depositErr } = await supabase
      .from('deposits')
      .update({ status: 'approved' })
      .eq('id', depositId);

    if (depositErr) {
      adminErrorLogger.error(`[APPROVE_DEPOSIT_UPDATE_FAIL] ID: ${depositId} — ${depositErr.message}`);
      throw depositErr;
    }

    const newUserBalance = user.wallet_balance + amount;
    const { error: balanceErr } = await supabase
      .from('users')
      .update({ wallet_balance: newUserBalance })
      .eq('id', userId);

    if (balanceErr) {
      adminErrorLogger.error(`[USER_BALANCE_UPDATE_FAIL] UID: ${userId} — ${balanceErr.message}`);
      throw new Error('Failed to update user wallet');
    }

    const { data: adminWallet, error: adminFetchErr } = await supabase
      .from('admin_wallet')
      .select('balance')
      .eq('id', 1)
      .single();

    if (adminFetchErr || !adminWallet) {
      adminErrorLogger.error(`[ADMIN_WALLET_FETCH_FAIL] ${adminFetchErr?.message}`);
      throw new Error('Admin wallet not found');
    }

    const updatedAdminBalance = adminWallet.balance + amount;
    const { error: adminUpdateErr } = await supabase
      .from('admin_wallet')
      .update({ balance: updatedAdminBalance })
      .eq('id', 1);

    if (adminUpdateErr) {
      adminErrorLogger.error(`[ADMIN_WALLET_UPDATE_FAIL] ${adminUpdateErr.message}`);
      throw new Error('Failed to update admin wallet');
    }

    const { error: notifyErr } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        message: `Your deposit of ₹${amount} has been approved and added to your wallet.`,
        date: new Date().toISOString()
      }]);

    if (notifyErr) {
      adminErrorLogger.error(`[NOTIFY_FAIL] UID: ${userId} — ${notifyErr.message}`);
    }

    // Transaction record
    const { error: txnErr } = await supabase
      .from('admin_transactions')
      .insert([{
        amount,
        type: 'deposit',
        date: new Date().toISOString(),
        description: `Deposit of ₹${amount} approved for mobile ${user.mobile}`
      }]);

    if (txnErr) {
      adminErrorLogger.error(`[TXN_LOG_FAIL] Mobile: ${user.mobile} — ${txnErr.message}`);
    }

    adminLogger.info(`[DEPOSIT_APPROVED] Admin UID: ${sessionUser.user.id}, User: ${user.mobile}, Amount: ₹${amount}`);
    res.json({ message: 'Deposit approved successfully' });

  } catch (err) {
    adminErrorLogger.error(`[APPROVE_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: err.message || 'Approval failed' });
  }
});

// Reject a deposit request
app.post('/api/admin/reject-deposit', [
  extractToken,
  body('depositId').notEmpty().isInt({ gt: 0 }),
  body('userId').notEmpty().isString({ gt: 0 })
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[REJECT_UNAUTHORIZED] Invalid or expired token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[REJECT_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { depositId, userId } = req.body;

  try {
    const { error: depositErr } = await supabase
      .from('deposits')
      .update({ status: 'rejected' })
      .eq('id', depositId);

    if (depositErr) {
      adminErrorLogger.error(`[REJECT_DEPOSIT_UPDATE_FAIL] ID: ${depositId} — ${depositErr.message}`);
      throw depositErr;
    }

    const { error: notificationErr } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        message: `Your deposit request has been rejected. Please contact 9815939797 for more info.`,
        date: new Date().toISOString()
      }]);

    if (notificationErr) {
      adminErrorLogger.error(`[REJECT_NOTIFY_FAIL] UID: ${userId} — ${notificationErr.message}`);
    }

    adminLogger.info(`[DEPOSIT_REJECTED] Admin UID: ${sessionUser.user.id}, Target UID: ${userId}, Deposit ID: ${depositId}`);
    res.json({ message: 'Deposit rejected successfully' });

  } catch (err) {
    adminErrorLogger.error(`[REJECT_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to reject deposit request' });
  }
});

// Fetch all pending withdrawal requests
app.get('/api/admin/withdrawals', extractToken, async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[WITHDRAWALS_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { data, error } = await supabase
      .from('withdrawals')
      .select(`
        id,
        amount,
        upi_number,
        status,
        created_at,
        user_id,
        users (
          id,
          mobile
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      adminErrorLogger.error(`[WITHDRAWALS_DB_ERROR] ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    adminLogger.info(`[WITHDRAWALS_FETCHED] Admin UID: ${sessionUser.user.id} retrieved ${data.length} pending withdrawal(s)`);
    res.json(data);

  } catch (err) {
    adminErrorLogger.error(`[WITHDRAWALS_FETCH_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve withdrawals' });
  }
});

// Approve a withdrawal request
app.post('/api/admin/withdrawals/approve', [
  extractToken,

  body('requestId')
    .notEmpty().withMessage('Withdrawal request ID is required')
    .isInt({ gt: 0 }).withMessage('Request ID must be a positive integer'),

  body('mobile')
    .trim()
    .notEmpty().withMessage('Mobile number is required')
    .isLength({ min: 10, max: 10 }).withMessage('Mobile must be 10 digits')
    .isNumeric().withMessage('Mobile must contain only digits'),

  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ gt: 0 }).withMessage('Amount must be a positive number')
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[WITHDRAW_APPROVE_UNAUTHORIZED] Invalid or expired token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[WITHDRAW_APPROVE_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { requestId, mobile, amount } = req.body;

  try {
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (withdrawalError || !withdrawal) {
      adminErrorLogger.error(`[WITHDRAW_FETCH_INVALID] ID: ${requestId} — ${withdrawalError?.message}`);
      return res.status(400).json({ error: 'Invalid or already processed withdrawal request' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, wallet_balance, username, mobile')
      .eq('mobile', mobile)
      .single();

    if (userError || !user) {
      adminErrorLogger.error(`[USER_FETCH_FAIL] Mobile: ${mobile} — ${userError?.message}`);
      return res.status(404).json({ error: 'User not found' });
    }

    if ((user.wallet_balance || 0) < amount) {
      adminLogger.warn(`[WITHDRAW_BALANCE_INSUFFICIENT] UID: ${user.id}, Wallet: ₹${user.wallet_balance}, Requested: ₹${amount}`);
      return res.status(400).json({ error: 'Insufficient wallet balance' });
    }

    const { data: adminWallet, error: adminWalletErr } = await supabase
      .from('admin_wallet')
      .select('balance')
      .eq('id', 1)
      .single();

    if (adminWalletErr || !adminWallet) {
      adminErrorLogger.error(`[ADMIN_WALLET_FETCH_FAIL] ${adminWalletErr?.message}`);
      return res.status(500).json({ error: 'Admin wallet not found' });
    }

    const newUserBalance = user.wallet_balance - amount;
    const newAdminBalance = adminWallet.balance - amount;

    const { error: updateUserErr } = await supabase
      .from('users')
      .update({ wallet_balance: newUserBalance })
      .eq('id', user.id);

    if (updateUserErr) {
      adminErrorLogger.error(`[USER_BALANCE_UPDATE_FAIL] UID: ${user.id} — ${updateUserErr.message}`);
      return res.status(500).json({ error: 'Failed to update user balance' });
    }

    const { error: updateAdminWalletErr } = await supabase
      .from('admin_wallet')
      .update({ balance: newAdminBalance })
      .eq('id', 1);

    if (updateAdminWalletErr) {
      adminErrorLogger.error(`[ADMIN_WALLET_UPDATE_FAIL] ${updateAdminWalletErr.message}`);
      return res.status(500).json({ error: 'Failed to update admin balance' });
    }

    const { error: updateWithdrawalErr } = await supabase
      .from('withdrawals')
      .update({ status: 'approved' })
      .eq('id', requestId);

    if (updateWithdrawalErr) {
      adminErrorLogger.error(`[WITHDRAW_STATUS_UPDATE_FAIL] ID: ${requestId} — ${updateWithdrawalErr.message}`);
      return res.status(500).json({ error: 'Failed to update withdrawal status' });
    }

    const { error: notificationErr } = await supabase
      .from('notifications')
      .insert([{
        user_id: user.id,
        message: `Your withdrawal of ₹${amount} has been approved and wallet balance has been updated.`,
        date: new Date().toISOString()
      }]);

    if (notificationErr) {
      adminErrorLogger.error(`[NOTIFY_FAIL] UID: ${user.id} — ${notificationErr.message}`);
    }

    const { error: historyErr } = await supabase
      .from('admin_transactions')
      .insert([{
        amount,
        type: 'withdrawal',
        date: new Date().toISOString(),
        description: `Withdrawal of ₹${amount} approved for mobile ${user.mobile}`
      }]);

    if (historyErr) {
      adminErrorLogger.error(`[TXN_LOG_FAIL] Mobile: ${user.mobile} — ${historyErr.message}`);
    }

    adminLogger.info(`[WITHDRAW_APPROVED] Admin UID: ${sessionUser.user.id}, User: ${user.mobile}, ₹${amount}`);
    res.json({ message: 'Withdrawal approved successfully' });

  } catch (err) {
    adminErrorLogger.error(`[WITHDRAW_APPROVE_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: err.message || 'Approval failed' });
  }
});

// Reject a withdrawal request
app.post('/api/admin/withdrawals/reject', [
  extractToken,

  body('requestId')
    .notEmpty().withMessage('Withdrawal request ID is required')
    .isInt({ gt: 0 }).withMessage('Request ID must be a positive integer'),

  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isString({ gt: 0 }).withMessage('User ID must be a string')
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[WITHDRAW_REJECT_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[WITHDRAW_REJECT_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { requestId, userId } = req.body;

  try {
    const { error: updateErr } = await supabase
      .from('withdrawals')
      .update({ status: 'rejected' })
      .eq('id', requestId);

    if (updateErr) {
      adminErrorLogger.error(`[WITHDRAW_REJECT_UPDATE_FAIL] ID: ${requestId} — ${updateErr.message}`);
      return res.status(500).json({ error: 'Failed to update withdrawal status' });
    }

    const { error: notificationErr } = await supabase
      .from('notifications')
      .insert([{
        user_id: userId,
        message: `Your withdrawal request has been rejected. Please contact 9815939797 for more info.`,
        date: new Date().toISOString()
      }]);

    if (notificationErr) {
      adminErrorLogger.error(`[WITHDRAW_REJECT_NOTIFY_FAIL] UID: ${userId} — ${notificationErr.message}`);
    }

    adminLogger.info(`[WITHDRAW_REJECTED] Admin UID: ${sessionUser.user.id}, User UID: ${userId}, Request ID: ${requestId}`);
    res.json({ message: 'Withdrawal rejected successfully' });

  } catch (err) {
    adminErrorLogger.error(`[WITHDRAW_REJECT_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: err.message || 'Rejection failed' });
  }
});

// GET all pending tournament registrations
app.get('/api/admin/tournaments', extractToken, async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[TOURNAMENTS_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { data: pendingRegistrations, error: regError } = await supabase
      .from('tournament_registrations')
      .select('id, player1_id, player2_id, match_type, entry_fee, status');

    if (regError) {
      adminErrorLogger.error(`[TOURNAMENTS_REG_FETCH_FAIL] ${regError.message}`);
      throw regError;
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, mobile');

    if (userError) {
      adminErrorLogger.error(`[TOURNAMENTS_USER_FETCH_FAIL] ${userError.message}`);
      throw userError;
    }

    const userMap = {};
    userData.forEach(user => {
      userMap[user.id] = user.mobile;
    });

    let matchedPairs = [];
    let unmatchedPlayers = {};

    for (let reg of pendingRegistrations) {
      const key = `${reg.match_type}_${reg.entry_fee}`;
      if (!unmatchedPlayers[key]) unmatchedPlayers[key] = [];

      if (reg.player2_id) {
        matchedPairs.push({
          match_id: reg.id,
          player1_id: reg.player1_id,
          player2_id: reg.player2_id,
          player1_mobile: userMap[reg.player1_id] || 'Unknown',
          player2_mobile: userMap[reg.player2_id] || 'Unknown',
          match_type: reg.match_type,
          entry_fee: reg.entry_fee,
          status: 'matched',
        });
      } else {
        unmatchedPlayers[key].push({
          id: reg.id,
          user_id: reg.player1_id,
          user_mobile: userMap[reg.player1_id] || 'Unknown',
          match_type: reg.match_type,
          entry_fee: reg.entry_fee,
          status: 'pending',
        });
      }
    }

    adminLogger.info(`[TOURNAMENTS_FETCH_SUCCESS] UID: ${sessionUser.user.id}, Matches: ${matchedPairs.length}, Waiting groups: ${Object.keys(unmatchedPlayers).length}`);
    res.json({
      matches: matchedPairs,
      waitingPlayers: unmatchedPlayers,
    });

  } catch (err) {
    adminErrorLogger.error(`[TOURNAMENTS_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch tournaments' });
  }
});

// POST declare winner and distribute rewards
app.post('/api/admin/tournaments/winner', [
  extractToken,

  body('matchId')
    .notEmpty().withMessage('Match ID is required')
    .isInt({ gt: 0 }).withMessage('Match ID must be a positive integer'),

  body('winnerChoice')
    .notEmpty().withMessage('Winner choice is required')
    .isInt().withMessage('Winner choice must be 1 or 2')
    .custom(value => [1, 2].includes(value)).withMessage('Winner choice must be 1 or 2')
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[TOURNAMENT_WINNER_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[TOURNAMENT_WINNER_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { matchId, winnerChoice } = req.body;

  try {
    const { data: matchData, error: matchError } = await supabase
      .from('tournament_registrations')
      .select('player1_id, player2_id, entry_fee, reward')
      .eq('id', matchId)
      .single();

    if (matchError || !matchData) {
      adminErrorLogger.error(`[MATCH_FETCH_FAIL] ID: ${matchId} — ${matchError?.message}`);
      throw new Error("Match not found");
    }

    const { player1_id, player2_id, entry_fee, reward } = matchData;
    const winnerId = winnerChoice === 1 ? player1_id : player2_id;
    const loserId = winnerChoice === 1 ? player2_id : player1_id;
    const leftoverAmount = (entry_fee * 2) - reward;

    const { data: winner, error: winnerFetchErr } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', winnerId)
      .single();

    if (winnerFetchErr || !winner) {
      adminErrorLogger.error(`[WINNER_FETCH_FAIL] UID: ${winnerId} — ${winnerFetchErr?.message}`);
      throw new Error("Winner not found");
    }

    const newWinnerBalance = winner.wallet_balance + reward;
    const { error: winnerUpdateErr } = await supabase
      .from('users')
      .update({ wallet_balance: newWinnerBalance })
      .eq('id', winnerId);

    if (winnerUpdateErr) {
      adminErrorLogger.error(`[WINNER_WALLET_UPDATE_FAIL] UID: ${winnerId} — ${winnerUpdateErr.message}`);
      throw new Error("Failed to update winner’s wallet");
    }

    const { data: adminData, error: adminFetchErr } = await supabase
      .from('admin_wallet')
      .select('profits')
      .eq('id', 1)
      .single();

    if (adminFetchErr || !adminData) {
      adminErrorLogger.error(`[ADMIN_PROFITS_FETCH_FAIL] ${adminFetchErr?.message}`);
      throw new Error("Admin wallet not found");
    }

    const updatedProfits = adminData.profits + leftoverAmount;
    const { error: adminUpdateErr } = await supabase
      .from('admin_wallet')
      .update({ profits: updatedProfits })
      .eq('id', 1);

    if (adminUpdateErr) {
      adminErrorLogger.error(`[ADMIN_PROFITS_UPDATE_FAIL] ${adminUpdateErr.message}`);
      throw new Error("Failed to update admin profits");
    }

    const { error: matchDeleteErr } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('id', matchId);

    if (matchDeleteErr) {
      adminErrorLogger.error(`[MATCH_DELETE_FAIL] ID: ${matchId} — ${matchDeleteErr.message}`);
      throw new Error("Failed to delete match");
    }

    const now = new Date().toISOString();
    const { error: notifyErr } = await supabase
      .from('notifications')
      .insert([
        {
          user_id: winnerId,
          message: `Congrats, You won a ₹${reward} tournament match! Your wallet has been credited.`,
          date: now
        },
        {
          user_id: loserId,
          message: `You lost your ₹${entry_fee} tournament match. Better luck next time!`,
          date: now
        }
      ]);

    if (notifyErr) {
      adminErrorLogger.error(`[NOTIFY_WINNER_FAIL] UID: ${winnerId}, ${notifyErr.message}`);
    }

    adminLogger.info(`[TOURNAMENT_WINNER_DECLARED] Match ID: ${matchId}, Winner: ${winnerId}, Loser: ${loserId}, Reward: ₹${reward}, Profit: ₹${leftoverAmount}`);
    res.json({ message: "Winner declared, reward credited, and profits updated successfully" });

  } catch (err) {
    adminErrorLogger.error(`[WINNER_DECISION_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: err.message || "Failed to process winner declaration" });
  }
});

// POST cancel tournament
app.post('/api/admin/tournaments/cancel', [
  extractToken,

  body('registrationId')
    .notEmpty().withMessage('Registration ID is required')
    .isInt({ gt: 0 }).withMessage('Registration ID must be a positive integer'),

  body('player1_id')
    .notEmpty().withMessage('Player1 ID is required')
    .isInt({ gt: 0 }).withMessage('Player1 ID must be a positive integer')
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[TOURNAMENT_CANCEL_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[TOURNAMENT_CANCEL_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { registrationId, player1_id } = req.body;

  try {
    const { data: matchData, error: matchError } = await supabase
      .from('tournament_registrations')
      .select('entry_fee, status')
      .eq('id', registrationId)
      .single();

    if (matchError || !matchData) {
      adminErrorLogger.error(`[MATCH_FETCH_FAIL] ID: ${registrationId} — ${matchError?.message}`);
      return res.status(404).json({ error: 'Tournament registration not found' });
    }

    if (matchData.status !== 'pending') {
      adminLogger.warn(`[MATCH_NOT_PENDING] ID: ${registrationId}, Status: ${matchData.status}`);
      return res.status(400).json({ error: 'Only pending tournaments can be cancelled' });
    }

    const { entry_fee } = matchData;

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('wallet_balance')
      .eq('id', player1_id)
      .single();

    if (userError || !userData) {
      adminErrorLogger.error(`[USER_FETCH_FAIL] UID: ${player1_id} — ${userError?.message}`);
      return res.status(404).json({ error: 'User not found for refund' });
    }

    const newBalance = userData.wallet_balance + entry_fee;

    const { error: refundError } = await supabase
      .from('users')
      .update({ wallet_balance: newBalance })
      .eq('id', player1_id);

    if (refundError) {
      adminErrorLogger.error(`[REFUND_FAIL] UID: ${player1_id} — ${refundError.message}`);
      throw refundError;
    }

    const { error: deleteError } = await supabase
      .from('tournament_registrations')
      .delete()
      .eq('id', registrationId);

    if (deleteError) {
      adminErrorLogger.error(`[MATCH_DELETE_FAIL] ID: ${registrationId} — ${deleteError.message}`);
      throw deleteError;
    }

    const { error: notifyError } = await supabase
      .from('notifications')
      .insert([{
        user_id: player1_id,
        message: `No opponent joined your ₹${entry_fee} tournament. Your entry fee has been refunded. Try again later with a different match type or amount.`,
        date: new Date().toISOString()
      }]);

    if (notifyError) {
      adminErrorLogger.error(`[NOTIFY_FAIL] UID: ${player1_id} — ${notifyError.message}`);
    }

    adminLogger.info(`[TOURNAMENT_CANCELLED] Admin UID: ${sessionUser.user.id}, Player UID: ${player1_id}, Match ID: ${registrationId}, Refunded: ₹${entry_fee}`);
    res.json({ message: 'Tournament cancelled and entry fee refunded successfully.' });

  } catch (err) {
    adminErrorLogger.error(`[CANCEL_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to cancel tournament' });
  }
});

// GET admin profits
app.get('/api/admin/profits', extractToken, async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[PROFITS_UNAUTHORIZED] Invalid or expired token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { data, error } = await supabase
      .from('admin_wallet')
      .select('profits')
      .eq('id', 1)
      .single();

    if (error) {
      adminErrorLogger.error(`[PROFITS_FETCH_FAIL] ${error.message}`);
      throw error;
    }

    adminLogger.info(`[PROFITS_FETCH_SUCCESS] Admin UID: ${sessionUser.user.id}, Profits: ₹${data.profits}`);
    res.json({ profits: data.profits });

  } catch (err) {
    adminErrorLogger.error(`[PROFITS_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: "Failed to fetch profits" });
  }
});

// Get all users (now with pagination support)
app.get('/api/admin/users', extractToken, async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[USERS_UNAUTHORIZED] Invalid or expired token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  try {
    const { page = 1, limit = 50 } = req.query;
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    const { data, error } = await supabase
      .from('users')
      .select('id, mobile, username, wallet_balance')
      .range(start, end);

    if (error) {
      adminErrorLogger.error(`[USERS_FETCH_FAIL] Page: ${page}, Limit: ${limit} — ${error.message}`);
      throw error;
    }

    adminLogger.info(`[USERS_FETCH_SUCCESS] UID: ${sessionUser.user.id}, Page: ${page}, Count: ${data.length}`);
    res.json({ users: data, page: Number(page), limit: Number(limit) });

  } catch (err) {
    adminErrorLogger.error(`[USERS_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get full user details by mobile
app.get('/api/admin/user-details/:mobile', extractToken, async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[USER_DETAILS_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const { mobile } = req.params;

  try {
    // Step 1: Lookup user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, mobile, username, wallet_balance')
      .eq('mobile', mobile)
      .single();

    if (userError || !user) {
      adminLogger.warn(`[USER_NOT_FOUND] Mobile: ${mobile}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Step 2: Recent approved deposits
    const { data: deposits } = await supabase
      .from('deposits')
      .select('amount, status, created_at')
      .eq('status', 'approved')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Step 3: Recent approved withdrawals
    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('amount, upi_number, status, created_at')
      .eq('status', 'approved')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    adminLogger.info(`[USER_DETAILS_FETCHED] Admin UID: ${sessionUser.user.id}, Mobile: ${mobile}`);
    res.json({ user, deposits, withdrawals });

  } catch (err) {
    adminErrorLogger.error(`[USER_DETAILS_EXCEPTION] Mobile: ${mobile} — ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Send a notification
app.post('/api/admin/send-notification', [
  extractToken,

  body('message')
    .trim()
    .notEmpty().withMessage('Notification message is required')
    .isLength({ max: 300 }).withMessage('Message must not exceed 300 characters')
    .escape()
], async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[NOTIFY_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ error: 'Unauthorized access' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    adminLogger.warn(`[NOTIFY_VALIDATION_FAIL] ${JSON.stringify(errors.array())}`);
    return res.status(422).json({ errors: errors.array() });
  }

  const { message } = req.body;

  try {
    const { error } = await supabase
      .from('notifications')
      .insert([{
        message,
        date: new Date().toISOString()
      }]);

    if (error) {
      adminErrorLogger.error(`[NOTIFY_INSERT_FAIL] ${error.message}`);
      throw error;
    }

    adminLogger.info(`[NOTIFY_SENT] Admin UID: ${sessionUser.user.id}, Message: ${message.slice(0, 60)}...`);
    res.json({ message: 'Notification sent successfully.' });

  } catch (err) {
    adminErrorLogger.error(`[NOTIFY_EXCEPTION] ${err.message}`);
    res.status(500).json({ error: 'Failed to send notification.' });
  }
});

// Fetch all admin notifications 
app.get('/api/admin/notifications', extractToken, async (req, res) => {
  const { data: sessionUser, error: authError } = await supabase.auth.getUser(req.accessToken);

  if (authError) {
    adminLogger.warn(`[NOTIFICATIONS_UNAUTHORIZED] Invalid token`);
    return res.status(401).json({ success: false, error: 'Unauthorized access' });
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, message, date')
      .is('user_id', null)
      .order('date', { ascending: false })
      .limit(20);

    if (error) {
      adminErrorLogger.error(`[NOTIFICATIONS_FETCH_FAIL] ${error.message}`);
      return res.status(500).json({ success: false, error: error.message });
    }

    adminLogger.info(`[NOTIFICATIONS_FETCH_SUCCESS] Admin UID: ${sessionUser.user.id}, Count: ${data.length}`);
    res.json({ success: true, notifications: data || [] });

  } catch (err) {
    adminErrorLogger.error(`[NOTIFICATIONS_EXCEPTION] ${err.message}`);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});







app.post('/api/format-date', (req, res) => {
  const { timestamp } = req.body;

  try {
    if (!timestamp) {
      adminLogger.warn(`[FORMAT_DATE_INVALID] Timestamp missing in request`);
      throw new Error('Timestamp is required');
    }

    const date = new Date(`${timestamp}Z`);
    if (isNaN(date.getTime())) {
      adminLogger.warn(`[FORMAT_DATE_INVALID_FORMAT] Received invalid timestamp: ${timestamp}`);
      throw new Error('Invalid timestamp format');
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

    const formatted = new Intl.DateTimeFormat('en-IN', options).format(date);

    adminLogger.info(`[FORMAT_DATE_SUCCESS] Input: ${timestamp}, Output: ${formatted}`);
    res.json({ formatted });

  } catch (err) {
    adminErrorLogger.error(`[FORMAT_DATE_ERROR] ${err.message} | Raw: ${timestamp || 'null'}`);
    res.status(400).json({ error: 'Invalid timestamp' });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));