const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { getUserRole } = require("../utils/admin");

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    user.role = getUserRole(user);
    req.user = user;
    next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = authMiddleware;
