const { google } = require("googleapis");
const Post = require("../models/Post");
const User = require("../models/User");
const { getAuthorizedClient } = require("../config/youtube");
const { getVideoStream } = require("./storageService");

async function uploadShortToYouTube(postDoc) {
  const post = postDoc instanceof Post ? postDoc : await Post.findById(postDoc).populate("user");
  if (!post) {
    throw new Error("Post not found");
  }

  const user = post.user?._id ? post.user : await User.findById(post.user);
  if (!user) {
    throw new Error("User not found");
  }

  const oauth2Client = await getAuthorizedClient(user);
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const videoStream = await getVideoStream(
    post.storageProvider || "local",
    post.videoStorageKey || post.videoPath
  );

  const descriptionBlock = [
    post.description,
    post.captionText,
    post.hashtags.map((tag) => `#${tag}`).join(" ")
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: post.title,
        description: descriptionBlock,
        tags: post.hashtags
      },
      status: {
        privacyStatus: post.privacyStatus
      }
    },
    media: {
      body: videoStream
    }
  });

  post.youtubeVideoId = response.data.id || "";
  return response.data;
}

module.exports = { uploadShortToYouTube };
