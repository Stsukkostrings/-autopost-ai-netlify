const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const youtubeRoutes = require("./routes/youtubeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { startScheduler } = require("./config/cron");
const { isLocalStorage } = require("./services/storageService");

dotenv.config();
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (isLocalStorage()) {
  app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "AutoPost AI API",
    storageProvider: process.env.STORAGE_PROVIDER || "local"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal server error"
  });
});

app.listen(PORT, () => {
  console.log(`AutoPost AI backend running on port ${PORT}`);
  startScheduler();
});
