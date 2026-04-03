const dotenv = require("dotenv");
const connectDB = require("../../backend/config/db");
const { processDuePosts } = require("../../backend/config/cron");

dotenv.config();

module.exports.handler = async () => {
  try {
    await connectDB();
    const result = await processDuePosts();

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        mode: "scheduled",
        ...result
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        message: error.message
      })
    };
  }
};
