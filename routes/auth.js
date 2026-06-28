const express = require("express");
const User = require("../models/user.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const middleware = require("../Middleware/middleware.js");

const router = express.Router();
const SECRET = "jayu";
// Short-lived token issued after password check when 2FA is required
const TEMP_SECRET = "jayu_temp_2fa";

// ─── Register ────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existuser = await User.findOne({ email });
    if (existuser) {
      return res.status(401).json({ success: false, message: "Email already registered" });
    }
    const hashPassword = await bcrypt.hash(password, 10);
    const newuser = new User({ name, email, password: hashPassword });
    await newuser.save();

    const token = jwt.sign({ id: newuser._id }, SECRET, { expiresIn: "5h" });
    return res.status(200).json({
      success: true,
      token,
      user: { _id: newuser._id.toString(), name: newuser.name, email: newuser.email, twoFactorEnabled: false },
      message: "Account created successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to create account" });
  }
});

// ─── Login ───────────────────────────────────────────────────────────────────
// Step 1: verify email + password.
// If 2FA enabled → return tempToken + requiresTwoFactor flag (no full token yet).
// If 2FA disabled → return full token immediately.
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existuser = await User.findOne({ email });
    if (!existuser) {
      return res.status(401).json({ success: false, message: "No account found with this email" });
    }
    const checkpassword = await bcrypt.compare(password, existuser.password);
    if (!checkpassword) {
      return res.status(401).json({ success: false, message: "Incorrect password" });
    }

    // 2FA enabled → send temp token, ask for OTP
    if (existuser.twoFactorEnabled) {
      const tempToken = jwt.sign({ id: existuser._id, phase: "2fa" }, TEMP_SECRET, { expiresIn: "5m" });
      return res.status(200).json({
        success: true,
        requiresTwoFactor: true,
        tempToken,
        message: "Enter your authenticator code",
      });
    }

    // No 2FA → issue full token
    const token = jwt.sign({ id: existuser._id }, SECRET, { expiresIn: "5h" });
    return res.status(200).json({
      success: true,
      requiresTwoFactor: false,
      token,
      user: { _id: existuser._id.toString(), name: existuser.name, email: existuser.email, twoFactorEnabled: false },
      message: "Login successful",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login failed" });
  }
});

// ─── Login Step 2: verify TOTP code ──────────────────────────────────────────
router.post("/login/2fa", async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ success: false, message: "Token and code are required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, TEMP_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    if (decoded.phase !== "2fa") {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }

    const existuser = await User.findById(decoded.id);
    if (!existuser || !existuser.twoFactorSecret) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    const valid = speakeasy.totp.verify({
      secret: existuser.twoFactorSecret,
      encoding: "base32",
      token: code.replace(/\s/g, ""),
      window: 1, // allow 30s clock drift
    });

    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid code. Try again." });
    }

    const token = jwt.sign({ id: existuser._id }, SECRET, { expiresIn: "5h" });
    return res.status(200).json({
      success: true,
      token,
      user: { _id: existuser._id.toString(), name: existuser.name, email: existuser.email, twoFactorEnabled: true },
      message: "Login successful",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "2FA verification failed" });
  }
});

// ─── Verify token (already logged in) ────────────────────────────────────────
router.get("/verify", middleware, async (req, res) => {
  const u = await User.findById(req.user.id);
  return res.status(200).json({
    success: true,
    user: {
      _id: req.user.id.toString(),
      name: req.user.name,
      email: req.user.email,
      twoFactorEnabled: u?.twoFactorEnabled || false,
    },
  });
});

// ─── 2FA Setup: generate secret + QR code ────────────────────────────────────
router.post("/2fa/setup", middleware, async (req, res) => {
  try {
    const existuser = await User.findById(req.user.id);
    if (!existuser) return res.status(404).json({ success: false, message: "User not found" });

    const secretObj = speakeasy.generateSecret({
      name: `NoteApp (${existuser.email})`,
      length: 20,
    });

    // Use updateOne to bypass strict schema validation on old documents
    await User.updateOne(
      { _id: req.user.id },
      { $set: { twoFactorSecret: secretObj.base32, twoFactorEnabled: false } }
    );

    return res.status(200).json({
      success: true,
      otpauthUrl: secretObj.otpauth_url,
      secret: secretObj.base32,
      message: "Scan the QR code with your authenticator app",
    });
  } catch (err) {
    console.error("2FA setup error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to setup 2FA: " + err.message });
  }
});

// ─── 2FA Enable: verify first code to confirm setup ──────────────────────────
router.post("/2fa/enable", middleware, async (req, res) => {
  try {
    const { code } = req.body;
    const existuser = await User.findById(req.user.id);
    if (!existuser || !existuser.twoFactorSecret) {
      return res.status(400).json({ success: false, message: "Run setup first" });
    }

    const valid = speakeasy.totp.verify({
      secret: existuser.twoFactorSecret,
      encoding: "base32",
      token: code.replace(/\s/g, ""),
      window: 1,
    });

    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid code. Make sure your app is synced." });
    }

    await User.updateOne({ _id: req.user.id }, { $set: { twoFactorEnabled: true } });

    return res.status(200).json({ success: true, message: "Two-factor authentication enabled!" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to enable 2FA" });
  }
});

// ─── 2FA Disable ─────────────────────────────────────────────────────────────
router.post("/2fa/disable", middleware, async (req, res) => {
  try {
    const { code } = req.body;
    const existuser = await User.findById(req.user.id);
    if (!existuser) return res.status(404).json({ success: false, message: "User not found" });

    if (existuser.twoFactorEnabled) {
      // Require valid OTP to disable (prevents someone with stolen session from disabling 2FA)
      const valid = speakeasy.totp.verify({
        secret: existuser.twoFactorSecret,
        encoding: "base32",
        token: code.replace(/\s/g, ""),
        window: 1,
      });
      if (!valid) {
        return res.status(401).json({ success: false, message: "Invalid code. Enter your authenticator code to disable 2FA." });
      }
    }

    await User.updateOne({ _id: req.user.id }, { $set: { twoFactorEnabled: false, twoFactorSecret: null } });

    return res.status(200).json({ success: true, message: "Two-factor authentication disabled." });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to disable 2FA" });
  }
});


// ─── DEBUG: test routes (remove after fixing) ─────────────────────────────────
// Test 1: is new file live?
router.get("/2fa/test", (req, res) => {
  res.json({ success: true, message: "new auth.js is live", timestamp: new Date().toISOString() });
});

// Test 2: does speakeasy work?
router.get("/2fa/test-speakeasy", (req, res) => {
  try {
    const s = require("speakeasy");
    const secret = s.generateSecret({ name: "test", length: 20 });
    res.json({ success: true, base32: secret.base32.slice(0, 8) + "...", otpauth: secret.otpauth_url.slice(0, 30) + "..." });
  } catch(err) {
    res.json({ success: false, step: "speakeasy", error: err.message });
  }
});

// Test 3: no-middleware version of 2fa/setup to bypass auth
router.post("/2fa/setup-debug", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false, message: "send userId in body" });
    const existuser = await User.findById(userId);
    if (!existuser) return res.json({ success: false, message: "user not found: " + userId });
    const speakeasy = require("speakeasy");
    const secretObj = speakeasy.generateSecret({ name: `NoteApp (${existuser.email})`, length: 20 });
    await User.updateOne({ _id: userId }, { $set: { twoFactorSecret: secretObj.base32, twoFactorEnabled: false } });
    res.json({ success: true, otpauthUrl: secretObj.otpauth_url, secret: secretObj.base32 });
  } catch(err) {
    res.json({ success: false, error: err.message, stack: err.stack });
  }
});

module.exports = router;