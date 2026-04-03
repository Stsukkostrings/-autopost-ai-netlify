const { google } = require("googleapis");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { getOAuthClient, encryptTokenPayload } = require("../config/youtube");

async function getAuthUrl(req, res) {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly"
    ],
    state: req.user._id.toString()
  });

  res.json({ url });
}

async function handleCallback(req, res) {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send("Missing OAuth code or state.");
  }

  const user = await User.findById(state);
  if (!user) {
    return res.status(404).send("User not found.");
  }

  const oauth2Client = getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channelResponse = await youtube.channels.list({
    part: ["snippet"],
    mine: true
  });

  user.youtubeTokens = encryptTokenPayload(tokens);
  user.youtubeChannelTitle = channelResponse.data.items?.[0]?.snippet?.title || "";
  await user.save();

  const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5500";
  res.redirect(`${frontendUrl}?youtube=connected`);
}

async function getConnectionStatus(req, res) {
  res.json({
    youtubeConnected: Boolean(req.user.youtubeTokens),
    youtubeChannelTitle: req.user.youtubeChannelTitle || ""
  });
}

module.exports = {
  getAuthUrl: [authMiddleware, getAuthUrl],
  handleCallback,
  getConnectionStatus: [authMiddleware, getConnectionStatus]
};
