const cron = require("node-cron");
const Post = require("../models/Post");
const { uploadShortToYouTube } = require("../services/youtubeService");

let started = false;

function startScheduler() {
  if (started) {
    return;
  }

  started = true;
  cron.schedule("* * * * *", async () => {
    const now = new Date();

    try {
      // Every minute, pick up anything scheduled for now or earlier.
      const duePosts = await Post.find({
        status: "pending",
        scheduledAt: { $lte: now },
        isUploading: false
      }).populate("user");

      for (const post of duePosts) {
        post.isUploading = true;
        await post.save();

        try {
          await uploadShortToYouTube(post);
          post.status = "posted";
          post.postedAt = new Date();
          post.errorMessage = "";
        } catch (error) {
          post.status = "failed";
          post.errorMessage = error.message;
        } finally {
          post.isUploading = false;
          await post.save();
        }
      }
    } catch (error) {
      console.error("Scheduler failed:", error.message);
    }
  });
}

module.exports = { startScheduler };
