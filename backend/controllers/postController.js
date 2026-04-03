const Post = require("../models/Post");
const { generateCaption } = require("../services/openaiService");
const { saveUploadedVideo, deleteUploadedVideo } = require("../services/storageService");

function normalizeHashtags(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#*/, ""))
    .filter(Boolean);
}

async function listPosts(req, res) {
  const posts = await Post.find({ user: req.user._id }).sort({ scheduledAt: 1 });
  res.json({ posts });
}

async function createPost(req, res) {
  const { title, description, hashtags, privacyStatus, scheduledAt, useAICaption } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: "Video file is required" });
  }

  if (!title || !scheduledAt) {
    return res.status(400).json({ message: "Title and schedule time are required" });
  }

  const scheduleDate = new Date(scheduledAt);
  if (Number.isNaN(scheduleDate.getTime())) {
    return res.status(400).json({ message: "Invalid scheduled date" });
  }

  const captionText = useAICaption === "true"
    ? await generateCaption(title, description, normalizeHashtags(hashtags))
    : "";

  const uploadedVideo = await saveUploadedVideo(req.file);
  let post;

  try {
    post = await Post.create({
      user: req.user._id,
      title,
      description,
      hashtags: normalizeHashtags(hashtags),
      privacyStatus: privacyStatus || "private",
      videoPath: uploadedVideo.videoStorageKey,
      videoStorageKey: uploadedVideo.videoStorageKey,
      videoUrl: uploadedVideo.videoUrl,
      storageProvider: uploadedVideo.storageProvider,
      scheduledAt: scheduleDate,
      captionText
    });
  } catch (error) {
    await deleteUploadedVideo(uploadedVideo.storageProvider, uploadedVideo.videoStorageKey);
    throw error;
  }

  res.status(201).json({ post });
}

async function updatePost(req, res) {
  const post = await Post.findOne({ _id: req.params.id, user: req.user._id });
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  if (post.status === "posted") {
    return res.status(400).json({ message: "Posted videos cannot be edited" });
  }

  const { title, description, hashtags, privacyStatus, scheduledAt } = req.body;

  if (title) post.title = title;
  if (description !== undefined) post.description = description;
  if (hashtags !== undefined) post.hashtags = normalizeHashtags(hashtags);
  if (privacyStatus) post.privacyStatus = privacyStatus;

  if (scheduledAt) {
    const scheduleDate = new Date(scheduledAt);
    if (Number.isNaN(scheduleDate.getTime())) {
      return res.status(400).json({ message: "Invalid scheduled date" });
    }
    post.scheduledAt = scheduleDate;
  }

  // Failed posts should become pending again after edits so the scheduler can retry them.
  post.status = "pending";
  post.errorMessage = "";
  await post.save();
  res.json({ post });
}

async function deletePost(req, res) {
  const post = await Post.findOne({ _id: req.params.id, user: req.user._id });
  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  await deleteUploadedVideo(post.storageProvider || "local", post.videoStorageKey || post.videoPath);

  await post.deleteOne();
  res.json({ message: "Post deleted" });
}

module.exports = {
  listPosts,
  createPost,
  updatePost,
  deletePost
};
