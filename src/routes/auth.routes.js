const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth.middleware");
const { createOtp, verifyOtp, sendOtpEmail } = require("../utils/otp.util");

// Kept as the single source of truth for valid roles across the app
// (used by scripts/seedAdmin.js). Not used to trust a client-supplied
// role in /register — see the comment there.
const VALID_ROLES = ["student", "lecturer", "admin"];

// Generates a JWT carrying every field the rest of the app relies on.
// Every downstream consumer (auth.middleware.js, post.controller.js,
// emergency.controller.js) reads req.user.id / req.user.role /
// req.user.universityId, so all three must be signed into the token.
//
// IMPORTANT: this must only ever be called once a login is FULLY
// complete — i.e. after 2FA verification, if the account has 2FA
// enabled. Calling it earlier would hand out a working token before
// the second factor was actually checked, defeating the point of 2FA.
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      universityId: user.universityId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );
};

const userResponseShape = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  universityId: user.universityId,
});

// Register route
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirmPassword, universityId } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        status: "error",
        message: "Please provide all required fields",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "error",
        message: "Passwords do not match",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 6 characters long",
      });
    }

    // SECURITY: public registration can only ever create "student" accounts.
    // Any "role" field in the request body is intentionally ignored — do not
    // reintroduce a client-supplied role here. Admin and lecturer accounts
    // must be created through scripts/seedAdmin.js or a protected,
    // admin-authenticated endpoint, never through this public route.
    const requestedRole = "student";

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    // isVerified defaults to false on the schema — this account
    // cannot log in yet. No token is issued here anymore; the client
    // must call /verify-otp with the code just emailed before /login
    // will succeed.
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      universityId,
      role: requestedRole,
    });

    const code = await createOtp(newUser._id.toString(), "verify_signup");
    try {
      await sendOtpEmail(newUser.email, code, "verify_signup");
    } catch (emailError) {
      // The account exists but the verification email failed to send.
      // Don't fail registration for this — the client can call
      // /resend-otp. Log it server-side so a pattern of send failures
      // is visible without silently losing every failure.
      console.error("✗ Failed to send signup OTP email:", emailError.message);
    }

    res.status(201).json({
      status: "success",
      message: "Account created. Check your email for a verification code.",
      userId: newUser._id,
      email: newUser.email,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error registering user: " + error.message,
    });
  }
});

// Confirms a signup verification code. On success, marks the account
// verified — this is the point at which the account first becomes
// able to log in at all.
router.post("/verify-otp", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ status: "error", message: "userId and code are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const isValid = await verifyOtp(userId, "verify_signup", code);
    if (!isValid) {
      return res.status(400).json({ status: "error", message: "Invalid or expired code" });
    }

    user.isVerified = true;
    await user.save();

    // Verification is complete — safe to issue a token now, sparing
    // the user a separate login step immediately after signing up.
    const token = generateToken(user);

    res.status(200).json({
      status: "success",
      message: "Account verified",
      token,
      user: userResponseShape(user),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error verifying code: " + error.message });
  }
});

// Resends a signup verification code — for expired codes or emails
// that didn't arrive. Deliberately does not reveal whether the userId
// exists in a different state (e.g. already verified) beyond what's
// needed for the client to react correctly.
router.post("/resend-otp", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ status: "error", message: "userId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }
    if (user.isVerified) {
      return res.status(400).json({ status: "error", message: "This account is already verified" });
    }

    const code = await createOtp(userId, "verify_signup");
    try {
      await sendOtpEmail(user.email, code, "verify_signup");
    } catch (emailError) {
      console.error("✗ Failed to resend OTP email:", emailError.message);
      return res.status(502).json({
        status: "error",
        message: "Could not send the verification email right now. Please try again shortly.",
      });
    }

    res.status(200).json({ status: "success", message: "A new code has been sent." });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error resending code: " + error.message });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Please provide email and password",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Signup verification gate — an unverified account cannot log in
    // at all, per the earlier design decision. Checked before the 2FA
    // branch below, since an unverified account shouldn't be able to
    // trigger a 2FA email either.
    if (!user.isVerified) {
      return res.status(403).json({
        status: "error",
        message: "Please verify your email before logging in.",
        requiresVerification: true,
        userId: user._id,
      });
    }

    // 2FA branch: password was correct, but this account has opted
    // into a second factor. No token is issued yet — the client must
    // call /verify-login-otp with the code just emailed to complete
    // the login. This mirrors the register→verify-otp two-step shape
    // above, reusing the same OtpCode model with a different purpose.
    if (user.twoFactorEnabled) {
      const code = await createOtp(user._id.toString(), "login_2fa");
      try {
        await sendOtpEmail(user.email, code, "login_2fa");
      } catch (emailError) {
        console.error("✗ Failed to send 2FA login OTP email:", emailError.message);
        return res.status(502).json({
          status: "error",
          message: "Could not send the login code right now. Please try again shortly.",
        });
      }

      return res.status(200).json({
        status: "success",
        message: "A login code has been sent to your email.",
        requiresTwoFactor: true,
        userId: user._id,
      });
    }

    const token = generateToken(user);

    res.status(200).json({
      status: "success",
      message: "Login successful",
      token,
      user: userResponseShape(user),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error logging in: " + error.message,
    });
  }
});

// Completes a 2FA login: password was already verified in /login,
// this only checks the emailed code and issues the token.
router.post("/verify-login-otp", async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ status: "error", message: "userId and code are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const isValid = await verifyOtp(userId, "login_2fa", code);
    if (!isValid) {
      return res.status(400).json({ status: "error", message: "Invalid or expired code" });
    }

    const token = generateToken(user);

    res.status(200).json({
      status: "success",
      message: "Login successful",
      token,
      user: userResponseShape(user),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error completing login: " + error.message });
  }
});

// Requests a password change: caller must already be logged in AND
// re-supply their current password (not just hold a valid token) —
// this prevents an unattended, already-authenticated session from
// being used by someone else to silently change the password. On
// success, sends an OTP to the account's own email; the actual
// password is NOT changed until /confirm-password-change verifies it.
router.post("/request-password-change", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        status: "error",
        message: "currentPassword, newPassword, and confirmNewPassword are required",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ status: "error", message: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "New password must be at least 6 characters long",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const isCurrentPasswordValid = await bcryptjs.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ status: "error", message: "Current password is incorrect" });
    }

    // The new password is hashed and stashed on the user document now
    // (not saved as the active password yet) so /confirm-password-change
    // doesn't need the client to resend it alongside the OTP - the
    // client only needs to send the code back.
    user.pendingPasswordHash = await bcryptjs.hash(newPassword, 10);
    await user.save();

    const code = await createOtp(user._id.toString(), "password_change");
    try {
      await sendOtpEmail(user.email, code, "password_change");
    } catch (emailError) {
      console.error("✗ Failed to send password-change OTP email:", emailError.message);
      return res.status(502).json({
        status: "error",
        message: "Could not send the confirmation email right now. Please try again shortly.",
      });
    }

    res.status(200).json({
      status: "success",
      message: "A confirmation code has been sent to your email.",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error requesting password change: " + error.message,
    });
  }
});

// Confirms a password change: verifies the OTP, then promotes the
// pendingPasswordHash (set in /request-password-change) to the
// user's actual password. Requires the same authenticated session
// that started the request.
router.post("/confirm-password-change", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ status: "error", message: "code is required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    if (!user.pendingPasswordHash) {
      return res.status(400).json({
        status: "error",
        message: "No password change is currently pending. Please start again.",
      });
    }

    const isValid = await verifyOtp(user._id.toString(), "password_change", code);
    if (!isValid) {
      return res.status(400).json({ status: "error", message: "Invalid or expired code" });
    }

    user.password = user.pendingPasswordHash;
    user.pendingPasswordHash = undefined;
    await user.save();

    res.status(200).json({ status: "success", message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error confirming password change: " + error.message,
    });
  }
});

router.VALID_ROLES = VALID_ROLES;

module.exports = router;
