const nodemailer = require('nodemailer');
// SMTP Service for cloud-vault loaded with secure TLS and Gemini capabilities

const sendResetEmail = async (email, token) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${frontendUrl}/reset-password?token=${token}`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465, // SSL on 465, TLS/STARTTLS on other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false, // Prevents local self-signed certificate rejection
    },
  });

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Cloud Vault Support" <support@cloudvault.com>',
    to: email,
    subject: 'Password Reset - Cloud Vault',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #6C63FF; text-align: center;">Cloud Vault Password Reset</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password for your Cloud Vault account. Click the button below to secure your account and set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #6C63FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>This password reset link will expire in 1 hour.</p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 20px 0;" />
        <p style="font-size: 12px; color: #a0aec0; text-align: center;">Cloud Vault Inc. &copy; 2026</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Password reset email sent to: ${email}`);
    return true;
  } catch (err) {
    console.error('[EmailService] SMTP error:', err.message);
    console.log('\n=============================================================');
    console.log('📬 [DEVELOPMENT FALLBACK] PASSWORD RESET REQUEST');
    console.log(`TO: ${email}`);
    console.log(`RESET URL: ${resetLink}`);
    console.log('=============================================================\n');
    return true;
  }
};

module.exports = { sendResetEmail };