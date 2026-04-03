const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { register, login, me } = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, me);

module.exports = router;
