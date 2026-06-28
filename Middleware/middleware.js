const jwt = require("jsonwebtoken");
const User = require("../models/user.js");

const SECRET = "jayu";

const middleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Expose both id (string) and _id (ObjectId) so routes work with either
    req.user = {
      id: user._id,        // ObjectId — Mongoose will match this correctly
      _id: user._id,       // alias
      name: user.name,
      email: user.email,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports = middleware;
