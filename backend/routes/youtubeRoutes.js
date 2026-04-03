const express = require("express");
const {
  getAuthUrl,
  handleCallback,
  getConnectionStatus
} = require("../controllers/youtubeController");

const router = express.Router();

router.get("/auth-url", ...getAuthUrl);
router.get("/callback", handleCallback);
router.get("/status", ...getConnectionStatus);

module.exports = router;
