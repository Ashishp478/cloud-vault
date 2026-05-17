const User = require('../models/User');
const Activity = require('../models/Activity');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { sendResetEmail } = require('../services/emailService');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

const generateTemp2FAToken = (id) => {
  return jwt.sign({ id, require2FA: true }, process.env.JWT_SECRET, {
    expiresIn: '15m', // 15 minutes temp token
  });
};

const logSecurityActivity = async (userId, actionType, desc) => {
  try {
    await Activity.create({ user: userId, actionType, fileName: desc });
  } catch (e) {
    console.error('Security activity log failed:', e.message);
  }
};

// ─── Register ─────────────────────────────────────────────────────────────────
const registerUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      email,
      password,
    });

    if (user) {
      await logSecurityActivity(user._id, 'Security', 'Account Registered'); // Use standard enum
      res.status(201).json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Password Login ───────────────────────────────────────────────────────────
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      // Check if Two-Factor Authentication is enabled
      if (user.twoFactorEnabled) {
        return res.json({
          require2FA: true,
          tempToken: generateTemp2FAToken(user._id),
        });
      }

      await logSecurityActivity(user._id, 'Security', 'Logged in');
      res.json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Verify 2FA Login ────────────────────────────────────────────────────────
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
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1, // tolerance window of 1 (30s before/after)
    });

    if (verified) {
      await logSecurityActivity(user._id, 'Security', 'Logged in (2FA Verified)');
      res.json({
        _id: user._id,
        email: user.email,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid 2FA code' });
    }
  } catch (error) {
    res.status(401).json({ message: 'Token expired or invalid', error: error.message });
  }
};

// ─── Setup 2FA (Profile) ─────────────────────────────────────────────────────
const setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is already enabled' });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `CloudVault (${user.email})`,
    });

    user.twoFactorTempSecret = secret.base32;
    await user.save();

    // Generate QR Code data URL
    qrcode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) {
        return res.status(500).json({ message: 'QR Code generation failed' });
      }
      res.json({
        secret: secret.base32,
        qrCode: dataUrl,
      });
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Verify & Enable 2FA (Profile Setup Phase) ──────────────────────────────
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
      res.json({ message: 'Two-Factor Authentication enabled successfully!' });
    } else {
      res.status(400).json({ message: 'Invalid verification code' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Disable 2FA ─────────────────────────────────────────────────────────────
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
    res.json({ message: 'Two-Factor Authentication disabled successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Forgot Password Trigger ──────────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email address required' });
  }

  try {
    const user = await User.findOne({ email });

    // For security: return 200 even if the user is not found to prevent user harvesting
    if (!user) {
      return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiry
    await user.save();

    // Send email (or log to terminal as fallback)
    await sendResetEmail(user.email, token);

    await logSecurityActivity(user._id, 'Security', 'Requested Password Reset');
    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Reset Password Action ────────────────────────────────────────────────────
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
    res.json({ message: 'Password reset completed successfully. You can now login.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Get Profile ─────────────────────────────────────────────────────────────
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── Manual Update Password (Profile Page) ───────────────────────────────────
const updatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.password = req.body.password || user.password;
      await user.save();
      await logSecurityActivity(user._id, 'Security', 'Updated Password');
      res.json({ message: 'Password updated successfully' });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
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
