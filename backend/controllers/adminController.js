const User = require("../models/User");
const Post = require("../models/Post");
const { processDuePosts } = require("../config/cron");

async function getAnalytics(_req, res) {
  const [totalUsers, totalPosts, connectedChannels, statusCounts, recentUsers, topHashtags, recentFailures, dailyPosts] =
    await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      User.countDocuments({
        $or: [
          { youtubeTokens: { $exists: true, $ne: "" } },
          { youtubeChannelTitle: { $exists: true, $ne: "" } }
        ]
      }),
      Post.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 }
          }
        }
      ]),
      User.countDocuments({
        createdAt: {
          $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }),
      Post.aggregate([
        { $unwind: { path: "$hashtags", preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: { $toLower: "$hashtags" },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      Post.find({ status: "failed" })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate("user", "name email"),
      Post.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

  const counts = {
    pending: 0,
    posted: 0,
    failed: 0
  };

  statusCounts.forEach((item) => {
    counts[item._id] = item.count;
  });

  res.json({
    metrics: {
      totalUsers,
      recentUsers,
      totalPosts,
      connectedChannels,
      pendingPosts: counts.pending,
      postedPosts: counts.posted,
      failedPosts: counts.failed,
      successRate: totalPosts ? Math.round((counts.posted / totalPosts) * 100) : 0
    },
    charts: {
      dailyPosts
    },
    topHashtags: topHashtags.map((item) => ({
      hashtag: item._id,
      count: item.count
    })),
    recentFailures: recentFailures.map((post) => ({
      id: post._id,
      title: post.title,
      errorMessage: post.errorMessage,
      updatedAt: post.updatedAt,
      userName: post.user?.name || "Unknown user",
      userEmail: post.user?.email || ""
    }))
  });
}

async function runSchedulerNow(_req, res) {
  const result = await processDuePosts();
  res.json({
    message: "Scheduler run complete",
    ...result
  });
}

module.exports = {
  getAnalytics,
  runSchedulerNow
};
