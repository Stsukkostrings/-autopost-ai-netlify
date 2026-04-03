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
const { isLocalStorage } = require("./services/storageService");

dotenv.config();

let isConnected = false;

async function ensureDatabase() {
  if (!isConnected) {
    await connectDB();
    isConnected = true;
  }
}

const app = express();

app.set("trust proxy", 1);
app.use(async (_req, _res, next) => {
  try {
    await ensureDatabase();
    next();
  } catch (error) {
    next(error);
  }
});
app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(
  cors({
    origin: true,
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

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "AutoPost AI API",
    runtime: "netlify-functions",
    storageProvider: process.env.STORAGE_PROVIDER || "local"
  });
});

app.use("/auth", authRoutes);
app.use("/posts", postRoutes);
app.use("/youtube", youtubeRoutes);
app.use("/admin", adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (err.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal server error"
  });
});

module.exports = app;
