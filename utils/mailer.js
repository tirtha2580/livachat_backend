const nodemailer = require("nodemailer");

async function sendOtpEmail(email, otp, subject = "Verify your account", expireMinutes = 5) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const text = `Your OTP is: ${otp}
It will expire in ${expireMinutes} minutes.`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject,
    text,
  });
}

module.exports = sendOtpEmail;
