const serverless = require("serverless-http");
const app = require("../../backend/netlifyApp");

module.exports.handler = serverless(app, {
  basePath: "/.netlify/functions/api"
});
