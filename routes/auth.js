const express = require("express");
const user = require("../models/user.js");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const middleware = require("../Middleware/middleware.js");

const router = express.Router();
const SECRET = "jayu";

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existuser = await user.findOne({ email });
    if (existuser) {
      return res.status(401).json({ success: false, message: "Email already registered" });
    }
    const hashPassword = await bcrypt.hash(password, 10);
    const newuser = new user({ name, email, password: hashPassword });
    await newuser.save();

    // Auto-login after register: return token + user
    const token = jwt.sign({ id: newuser._id }, SECRET, { expiresIn: "5h" });
    return res.status(200).json({
      success: true,
      token,
      user: { _id: newuser._id.toString(), name: newuser.name, email: newuser.email },
      message: "Account created successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to create account" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existuser = await user.findOne({ email });
    if (!existuser) {
      return res.status(401).json({ success: false, message: "No account found with this email" });
    }
    const checkpassword = await bcrypt.compare(password, existuser.password);
    if (!checkpassword) {
      return res.status(401).json({ success: false, message: "Incorrect password" });
    }
    const token = jwt.sign({ id: existuser._id }, SECRET, { expiresIn: "5h" });
    return res.status(200).json({
      success: true,
      token,
      // Return _id so frontend and note routes can use it reliably
      user: { _id: existuser._id.toString(), name: existuser.name, email: existuser.email },
      message: "Login successful",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login failed" });
  }
});

// Verify token
router.get("/verify", middleware, async (req, res) => {
  return res.status(200).json({
    success: true,
    user: { _id: req.user.id.toString(), name: req.user.name, email: req.user.email }
  });
});

module.exports = router;
