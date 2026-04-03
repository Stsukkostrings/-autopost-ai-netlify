const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      default: "",
      maxlength: 5000
    },
    hashtags: {
      type: [String],
      default: []
    },
    privacyStatus: {
      type: String,
      enum: ["private", "public", "unlisted"],
      default: "private"
    },
    videoPath: {
      type: String,
      default: ""
    },
    videoStorageKey: {
      type: String,
      required: true
    },
    videoUrl: {
      type: String,
      default: ""
    },
    storageProvider: {
      type: String,
      enum: ["local", "s3"],
      default: "local"
    },
    scheduledAt: {
      type: Date,
      required: true
    },
    uploadDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["pending", "posted", "failed"],
      default: "pending"
    },
    postedAt: Date,
    youtubeVideoId: {
      type: String,
      default: ""
    },
    errorMessage: {
      type: String,
      default: ""
    },
    isUploading: {
      type: Boolean,
      default: false
    },
    captionText: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Post", postSchema);
