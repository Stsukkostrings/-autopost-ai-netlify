const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { getAnalytics, runSchedulerNow } = require("../controllers/adminController");

const router = express.Router();

router.get("/analytics", authMiddleware, adminMiddleware, getAnalytics);
router.post("/run-due-posts", authMiddleware, adminMiddleware, runSchedulerNow);

module.exports = router;
