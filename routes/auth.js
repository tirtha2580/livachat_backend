const express = require('express');
const router = express.Router();
const {
  register,
  verifyOtp,
  login,
  forgotUsernameSendOtp,
  forgotUsernameVerify,
  forgotPasswordSendOtp,
  resetPassword,
} = require('../controllers/authController');

// existing
router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/login', login);

// forgot username
router.post('/forgot-username/send-otp', forgotUsernameSendOtp);
router.post('/forgot-username/verify', forgotUsernameVerify);

// forgot password
router.post('/forgot-password/send-otp', forgotPasswordSendOtp);
router.post('/forgot-password/reset', resetPassword);

module.exports = router;