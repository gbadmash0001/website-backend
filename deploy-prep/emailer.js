/* 
  📫 Email alert system using Nodemailer
  - Make sure to replace YOUR_EMAIL and APP_PASSWORD below
  - Use app-specific passwords if you have 2FA enabled
*/

const nodemailer = require('nodemailer');

const sendAlertEmail = async (message) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'YOUR_EMAIL@gmail.com',
      pass: 'YOUR_APP_PASSWORD'
    }
  });

  await transporter.sendMail({
    from: 'YOUR_EMAIL@gmail.com',
    to: 'YOUR_EMAIL@gmail.com',
    subject: '🚨 Server Monitor Alert',
    text: message
  });
};

module.exports = { sendAlertEmail };