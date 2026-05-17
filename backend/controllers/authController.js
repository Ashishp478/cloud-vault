const User = require('../models/User');
const Activity = require('../models/Activity');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { sendResetEmail } = require('../services/emailService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const generateTemp2FAToken = (id) => {
  return jwt.sign({ id, require2FA: true }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const logSecurityActivity = async (userId, actionType, desc) => {
  try {
    await Activity.create({ user: userId, actionType, fileName: desc });
  } catch (e) {
    console.error('Security activity log failed:', e.message);
  }
};

// FIX: Production-safe error handler — never leaks stack traces
const serverError = (res, error, context = 'Server error') => {
  console.error(`[${context}]`, error);
  return res.status(500).json({
    message: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : error.message,
  });
};

// ─── Register ─────────────────────────────────────────────────────────────────

const registerUser = async (req, res) => {
  const { email, password } = req.body;

  // FIX: Input validation added
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({ email, password });

    if (user) {
      // FIX: Activity log re-enabled (was commented out)
      await logSecurityActivity(user._id, 'Security', 'Account Registered');

      return res.status(201).json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    }

    return res.status(400).json({ message: 'Invalid user data' });

  } catch (error) {
    return serverError(res, error, 'registerUser');
  }
};

// ─── Password Login ───────────────────────────────────────────────────────────

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  // FIX: Input validation added
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (user.twoFactorEnabled) {
        return res.json({
          require2FA: true,
          tempToken: generateTemp2FAToken(user._id),
        });
      }

      await logSecurityActivity(user._id, 'Security', 'Logged in');
      return res.json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    }

    return res.status(401).json({ message: 'Invalid email or password' });

  } catch (error) {
    return serverError(res, error, 'loginUser');
  }
};

// ─── Verify 2FA Login ─────────────────────────────────────────────────────────

const login2FA = async (req, res) => {
  const { tempToken, code } = req.body;

  if (!tempToken || !code) {
    return res.status(400).json({ message: 'Temp token and OTP code required' });
  }

  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);

    if (!decoded.require2FA) {
      return res.status(400).json({ message: 'Invalid token type' });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // FIX: Guard if 2FA was disabled between temp token issue and this call
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ message: '2FA is not enabled for this account' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (verified) {
      await logSecurityActivity(user._id, 'Security', 'Logged in (2FA Verified)');
      return res.json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    }

    return res.status(401).json({ message: 'Invalid 2FA code' });

  } catch (error) {
    // FIX: Distinguish JWT errors from real server errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired or invalid' });
    }
    return serverError(res, error, 'login2FA');
  }
};

// ─── Setup 2FA ────────────────────────────────────────────────────────────────

const setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    const secret = speakeasy.generateSecret({ name: `CloudVault (${user.email})` });

    user.twoFactorTempSecret = secret.base32;
    await user.save();

    // FIX: Use promise-based qrcode instead of callback (avoids response-after-send bugs)
    try {
      const dataUrl = await qrcode.toDataURL(secret.otpauth_url);
      return res.json({ secret: secret.base32, qrCode: dataUrl });
    } catch (qrErr) {
      return res.status(500).json({ message: 'QR Code generation failed' });
    }

  } catch (error) {
    return serverError(res, error, 'setup2FA');
  }
};

// ─── Verify & Enable 2FA ──────────────────────────────────────────────────────

const verify2FA = async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: 'OTP code required' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.twoFactorTempSecret) {
      return res.status(400).json({ message: '2FA setup has not been initiated' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorTempSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (verified) {
      user.twoFactorSecret = user.twoFactorTempSecret;
      user.twoFactorTempSecret = undefined;
      user.twoFactorEnabled = true;
      await user.save();

      await logSecurityActivity(user._id, 'Security', 'Enabled 2FA Security');
      return res.json({ message: 'Two-Factor Authentication enabled successfully!' });
    }

    return res.status(400).json({ message: 'Invalid verification code' });

  } catch (error) {
    return serverError(res, error, 'verify2FA');
  }
};

// ─── Disable 2FA ──────────────────────────────────────────────────────────────

const disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is not enabled' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorTempSecret = undefined;
    await user.save();

    await logSecurityActivity(user._id, 'Security', 'Disabled 2FA Security');
    return res.json({ message: 'Two-Factor Authentication disabled successfully.' });

  } catch (error) {
    return serverError(res, error, 'disable2FA');
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email address required' });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    await sendResetEmail(user.email, token);

    await logSecurityActivity(user._id, 'Security', 'Requested Password Reset');
    return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });

  } catch (error) {
    return serverError(res, error, 'forgotPassword');
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────

const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and new password required' });
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired password reset token' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await logSecurityActivity(user._id, 'Security', 'Password Reset Completed');
    return res.json({ message: 'Password reset completed successfully. You can now login.' });

  } catch (error) {
    return serverError(res, error, 'resetPassword');
  }
};

// ─── Get Profile ──────────────────────────────────────────────────────────────

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      return res.json(user);
    }
    return res.status(404).json({ message: 'User not found' });

  } catch (error) {
    return serverError(res, error, 'getUserProfile');
  }
};

// ─── Update Password ──────────────────────────────────────────────────────────

const updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // FIX: Was blindly accepting password with no current password check
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  // FIX: Prevent setting the same password
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: 'New password must be different from current password' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // FIX: Verify current password before allowing update
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await logSecurityActivity(user._id, 'Security', 'Updated Password');
    return res.json({ message: 'Password updated successfully' });

  } catch (error) {
    return serverError(res, error, 'updatePassword');
  }
};

module.exports = {
  registerUser,
  loginUser,
  login2FA,
  setup2FA,
  verify2FA,
  disable2FA,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updatePassword,
};