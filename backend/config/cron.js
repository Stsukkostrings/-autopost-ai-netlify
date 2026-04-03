const cron = require("node-cron");
const Post = require("../models/Post");
const { uploadShortToYouTube } = require("../services/youtubeService");

let started = false;

async function processDuePosts() {
  const now = new Date();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const duePosts = await Post.find({
    status: "pending",
    scheduledAt: { $lte: now },
    isUploading: false
  }).populate("user");

  for (const post of duePosts) {
    processed += 1;
    post.isUploading = true;
    await post.save();

    try {
      await uploadShortToYouTube(post);
      post.status = "posted";
      post.postedAt = new Date();
      post.errorMessage = "";
      succeeded += 1;
    } catch (error) {
      post.status = "failed";
      post.errorMessage = error.message;
      failed += 1;
    } finally {
      post.isUploading = false;
      await post.save();
    }
  }

  return {
    processed,
    succeeded,
    failed
  };
}

function startScheduler() {
  if (started) {
    return;
  }

  started = true;
  cron.schedule("* * * * *", async () => {
    try {
      await processDuePosts();
    } catch (error) {
      console.error("Scheduler failed:", error.message);
    }
  });
}

module.exports = { startScheduler, processDuePosts };
