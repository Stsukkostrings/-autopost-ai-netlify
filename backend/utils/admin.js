function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email = "") {
  return getAdminEmails().includes(String(email).trim().toLowerCase());
}

function getUserRole(user) {
  if (user?.role === "admin" || isAdminEmail(user?.email)) {
    return "admin";
  }

  return "user";
}

module.exports = {
  getAdminEmails,
  isAdminEmail,
  getUserRole
};
