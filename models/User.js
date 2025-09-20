const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, sparse: true }, // optional username
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },

    // Registration OTP
    otp: { type: String },          // store hashed OTP here (recommended)
    otpExpires: { type: Date },     // expiry time

    // Recovery OTP (forgot username/password)
    resetOTP: { type: String },
    resetOTPExpire: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
