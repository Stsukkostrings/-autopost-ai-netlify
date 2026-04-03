const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getAnalytics } = require("../controllers/adminController");

const router = express.Router();

router.get("/analytics", authMiddleware, adminMiddleware, getAnalytics);

module.exports = router;
