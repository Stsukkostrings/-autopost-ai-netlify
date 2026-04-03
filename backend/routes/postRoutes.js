const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  listPosts,
  createPost,
  updatePost,
  deletePost
} = require("../controllers/postController");

const router = express.Router();

router.use(authMiddleware);
router.get("/", listPosts);
router.post("/", upload.single("video"), createPost);
router.put("/:id", updatePost);
router.delete("/:id", deletePost);

module.exports = router;
