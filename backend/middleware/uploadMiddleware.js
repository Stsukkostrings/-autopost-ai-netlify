const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 200) * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      return cb(null, true);
    }
    cb(new Error("Only video files are allowed"));
  }
});

module.exports = upload;
