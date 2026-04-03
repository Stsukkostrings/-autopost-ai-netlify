const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { Readable } = require("stream");
const { S3Client, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

const uploadDir = path.join(__dirname, "..", "..", "uploads");

function getStorageProvider() {
  return (process.env.STORAGE_PROVIDER || "local").toLowerCase();
}

function isLocalStorage() {
  return getStorageProvider() === "local";
}

function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

function buildFileName(originalName = "video.mp4") {
  const extension = path.extname(originalName) || ".mp4";
  return `${Date.now()}-${randomUUID()}${extension}`;
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      : undefined
  });
}

function buildPublicUrl(key) {
  if (isLocalStorage()) {
    return `/${key.replace(/\\/g, "/")}`;
  }

  if (process.env.AWS_S3_PUBLIC_BASE_URL) {
    return `${process.env.AWS_S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }

  return "";
}

async function saveUploadedVideo(file) {
  const key = `uploads/${buildFileName(file.originalname)}`;

  if (isLocalStorage()) {
    ensureUploadDir();
    const absolutePath = path.join(__dirname, "..", "..", key);
    await fs.promises.writeFile(absolutePath, file.buffer);
    return {
      storageProvider: "local",
      videoStorageKey: key,
      videoUrl: buildPublicUrl(key)
    };
  }

  if (!process.env.AWS_S3_BUCKET) {
    throw new Error("AWS_S3_BUCKET is required when STORAGE_PROVIDER=s3");
  }

  const upload = new Upload({
    client: getS3Client(),
    params: {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    }
  });

  await upload.done();

  return {
    storageProvider: "s3",
    videoStorageKey: key,
    videoUrl: buildPublicUrl(key)
  };
}

async function deleteUploadedVideo(storageProvider, key) {
  if (!key) {
    return;
  }

  if (storageProvider === "s3") {
    if (!process.env.AWS_S3_BUCKET) {
      return;
    }
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      })
    );
    return;
  }

  const absolutePath = path.join(__dirname, "..", "..", key);
  if (fs.existsSync(absolutePath)) {
    await fs.promises.unlink(absolutePath);
  }
}

async function getVideoStream(storageProvider, key) {
  if (storageProvider === "s3") {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      })
    );
    return response.Body;
  }

  const absolutePath = path.join(__dirname, "..", "..", key);
  if (!fs.existsSync(absolutePath)) {
    throw new Error("Video file not found");
  }

  return fs.createReadStream(absolutePath);
}

function bufferToStream(buffer) {
  return Readable.from(buffer);
}

module.exports = {
  isLocalStorage,
  saveUploadedVideo,
  deleteUploadedVideo,
  getVideoStream,
  bufferToStream
};
