const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const sendOtpEmail = require("../utils/mailer");
const generateOtp = require("../utils/generateOtp");

// const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// ===== Existing flows (register, verify, login) — keep yours or use these stubs =====
exports.register = async (req, res) => {
  try {
    const { username, email, password, mobile } = req.body;

    if (!username || !email || !password || !mobile) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or Mobile already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate OTP
    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // Send OTP via email
    await sendOtpEmail(email, otp, 'Registration OTP');

    const user = new User({
      username,
      email,
      password: hashedPassword,
      mobile,
      otp: hashedOtp, // hashed OTP saved
      otpExpires: Date.now() + 5 * 60 * 1000 // 5 min
    });

    await user.save();

    res.status(201).json({ message: 'User registered, OTP sent to email' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (!user.otp || !user.otpExpires || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: 'OTP expired, please request a new one' });
    }

    // Compare OTP with hashed value
    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Mark verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ message: 'OTP verified successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body; 
    // email can be email / username / mobile

   if (!email || !password) {
  return res.status(400).json({ message: "email and password required" });
}


    const user = await User.findOne({
      $or: [
        { email: email },
        { username: email },
        { mobile: email }
      ]
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // ✅ Check if user verified via OTP
    if (!user.isVerified) {
      return res.status(400).json({ message: "Please verify your account first" });
    }

    // ✅ Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ Generate JWT
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ Respond with user info
    res.json({
      message: "Login successful",
      token,
      user: {
        username: user.username,
        email: user.email,
        mobile: user.mobile
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// ===== Forgot Username =====
// Step 1: send OTP to email
exports.forgotUsernameSendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = generateOtp(); // <-- fixed here
    user.resetOTP = otp;
    user.resetOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, otp, 'OTP for username recovery');
    res.json({ message: 'OTP sent to email' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Step 2: verify OTP and reveal username
exports.forgotUsernameVerify = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.resetOTP !== otp || user.resetOTPExpire < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }
    // Clean up the OTP but keep it optional if you want multi-use window
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;
    await user.save();

    res.json({ username: user.username || user.email.split('@')[0] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ===== Forgot Password =====
// Step 1: send OTP to email (by email or username)
exports.forgotPasswordSendOtp = async (req, res) => {
  try {
    const { email, username } = req.body;
    const user = email ? await User.findOne({ email }) : await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = generateOtp();
    user.resetOTP = otp;
    user.resetOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(user.email, otp, 'OTP for password reset');
    res.json({ message: 'OTP sent to email' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Step 2: verify OTP + set new password
exports.resetPassword = async (req, res) => {
  try {
    const { email, username, otp, newPassword } = req.body;
    const user = email ? await User.findOne({ email }) : await User.findOne({ username });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.resetOTP || user.resetOTP !== otp || user.resetOTPExpire < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetOTP = undefined;
    user.resetOTPExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};