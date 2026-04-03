const crypto = require("crypto");
const { google } = require("googleapis");

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI
  );
}

function getEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_SECRET || "";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptTokenPayload(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptTokenPayload(value) {
  const raw = Buffer.from(value, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(decrypted);
}

async function getAuthorizedClient(user) {
  if (!user.youtubeTokens) {
    throw new Error("YouTube account is not connected");
  }

  // Tokens are stored encrypted in MongoDB and decrypted only when needed.
  const payload = decryptTokenPayload(user.youtubeTokens);
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(payload);

  if (payload.expiry_date && payload.expiry_date <= Date.now()) {
    const refreshed = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshed.credentials);
    user.youtubeTokens = encryptTokenPayload({
      ...payload,
      ...refreshed.credentials
    });
    await user.save();
  }

  return oauth2Client;
}

module.exports = {
  getOAuthClient,
  getAuthorizedClient,
  encryptTokenPayload,
  decryptTokenPayload
};
