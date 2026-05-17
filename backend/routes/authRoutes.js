const express = require('express');
const {
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
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/login-2fa', login2FA);

// Password Reset Routes
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected Auth Routes
router.get('/profile', protect, getUserProfile);
router.put('/profile/password', protect, updatePassword);
router.post('/setup-2fa', protect, setup2FA);
router.post('/verify-2fa', protect, verify2FA);
router.post('/disable-2fa', protect, disable2FA);

module.exports = router;
