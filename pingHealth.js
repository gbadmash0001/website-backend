const http = require('http');
const fs = require('fs');
const path = require('path');
// const { sendAlertEmail } = require('./deploy-prep/emailer'); // 📩 Enable for email alerts

const LOG_PATH = path.join(__dirname, 'monitor.log');
const MAIN_HEALTH_URL = 'https://website-backend-server.onrender.com/api/health';
const ADMIN_HEALTH_URL = 'https://website-backend-adminserver.onrender.com/api/health';

// ✅ Format timestamp locally in Asia/Kolkata timezone
const formatTimestamp = () =>
  new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false
  });

const log = (msg) => {
  const readable = formatTimestamp();
  const line = `[${readable}] ${msg}\n`;
  fs.appendFileSync(LOG_PATH, line);
  console.log(line.trim());
};

const runHealthCheck = async (label, url) => {
  http.get(url, (res) => {
    if (res.statusCode === 200) {
      log(`✅ ${label} health check successful`);
    } else {
      log(`⚠️ ${label} health check returned status ${res.statusCode}`);
      // await sendAlertEmail(`⚠️ ${label} server warning: status ${res.statusCode} at ${formatTimestamp()}`);
    }
  }).on('error', async (err) => {
    const msg = `❌ ${label} health check failed: ${err.message}`;
    log(msg);
    // await sendAlertEmail(`❌ ${label} server unreachable: ${err.message}`);
  });
};

runHealthCheck('Main', MAIN_HEALTH_URL);
runHealthCheck('Admin', ADMIN_HEALTH_URL);