const API_BASE = `${window.location.protocol}//${window.location.hostname || "localhost"}:5000/api`;
const state = {
  token: localStorage.getItem("autopost_token") || "",
  user: JSON.parse(localStorage.getItem("autopost_user") || "null"),
  editingId: null
};

const authSection = document.getElementById("authSection");
const dashboardSection = document.getElementById("dashboardSection");
const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");
const postForm = document.getElementById("postForm");
const postList = document.getElementById("postList");
const toast = document.getElementById("toast");
const welcomeText = document.getElementById("welcomeText");
const youtubeStatusText = document.getElementById("youtubeStatusText");
const uploadProgress = document.getElementById("uploadProgress");
const connectYoutubeBtn = document.getElementById("connectYoutubeBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminAnalyticsSection = document.getElementById("adminAnalyticsSection");
const analyticsCards = document.getElementById("analyticsCards");
const dailyPostsChart = document.getElementById("dailyPostsChart");
const topHashtagsList = document.getElementById("topHashtagsList");
const recentFailuresList = document.getElementById("recentFailuresList");

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem("autopost_token", token);
  localStorage.setItem("autopost_user", JSON.stringify(user));
  renderSession();
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.editingId = null;
  localStorage.removeItem("autopost_token");
  localStorage.removeItem("autopost_user");
  renderSession();
}

async function apiFetch(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

function renderSession() {
  const isLoggedIn = Boolean(state.token && state.user);
  authSection.classList.toggle("hidden", isLoggedIn);
  dashboardSection.classList.toggle("hidden", !isLoggedIn);

  if (isLoggedIn) {
    welcomeText.textContent = `Welcome, ${state.user.name}`;
    renderYoutubeStatus();
    renderAdminVisibility();
    loadPosts();
    loadAdminAnalytics();
  }
}

function renderAdminVisibility() {
  adminAnalyticsSection.classList.toggle("hidden", state.user?.role !== "admin");
}

function renderYoutubeStatus() {
  if (!state.user) return;

  const connected = state.user.youtubeConnected;
  youtubeStatusText.textContent = connected
    ? `Connected to ${state.user.youtubeChannelTitle || "your YouTube account"}`
    : "YouTube account not connected yet.";
  connectYoutubeBtn.textContent = connected ? "Reconnect YouTube" : "Connect YouTube";
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Could not read video duration"));
    video.src = URL.createObjectURL(file);
  });
}

function fillFormForEdit(post) {
  state.editingId = post._id;
  postForm.title.value = post.title;
  postForm.description.value = post.description || "";
  postForm.hashtags.value = (post.hashtags || []).join(", ");
  postForm.privacyStatus.value = post.privacyStatus || "private";
  postForm.scheduledAt.value = new Date(post.scheduledAt).toISOString().slice(0, 16);
  postForm.video.required = false;
  postForm.querySelector("button[type='submit']").textContent = "Update Scheduled Post";
}

function resetPostForm() {
  state.editingId = null;
  postForm.reset();
  postForm.video.required = true;
  postForm.querySelector("button[type='submit']").textContent = "Save Scheduled Post";
}

function renderMetricCards(metrics) {
  const cards = [
    { label: "Total users", value: metrics.totalUsers },
    { label: "New users (7d)", value: metrics.recentUsers },
    { label: "Total posts", value: metrics.totalPosts },
    { label: "Connected channels", value: metrics.connectedChannels },
    { label: "Pending posts", value: metrics.pendingPosts },
    { label: "Posted posts", value: metrics.postedPosts },
    { label: "Failed posts", value: metrics.failedPosts },
    { label: "Success rate", value: `${metrics.successRate}%` }
  ];

  analyticsCards.innerHTML = cards
    .map(
      (card) => `
        <article class="analytics-card">
          <span class="eyebrow">${card.label}</span>
          <strong>${card.value}</strong>
        </article>
      `
    )
    .join("");
}

function renderDailyPostsChart(items) {
  if (!items.length) {
    dailyPostsChart.innerHTML = "<p>No post activity in the last 7 days.</p>";
    return;
  }

  const maxCount = Math.max(...items.map((item) => item.count), 1);
  dailyPostsChart.innerHTML = items
    .map(
      (item) => `
        <div class="chart-row">
          <span>${item._id}</span>
          <div class="chart-bar"><span style="width:${Math.max((item.count / maxCount) * 100, 8)}%"></span></div>
          <strong>${item.count}</strong>
        </div>
      `
    )
    .join("");
}

function renderTopHashtags(items) {
  if (!items.length) {
    topHashtagsList.innerHTML = "<p>No hashtag data yet.</p>";
    return;
  }

  topHashtagsList.innerHTML = items
    .map(
      (item) => `
        <div class="stack-item">
          <div class="stack-item-copy">
            <strong>#${item.hashtag}</strong>
            <small>Used across scheduled and posted Shorts</small>
          </div>
          <strong>${item.count}</strong>
        </div>
      `
    )
    .join("");
}

function renderRecentFailures(items) {
  if (!items.length) {
    recentFailuresList.innerHTML = "<p>No failed uploads right now.</p>";
    return;
  }

  recentFailuresList.innerHTML = items
    .map(
      (item) => `
        <div class="stack-item">
          <div class="stack-item-copy">
            <strong>${item.title}</strong>
            <small>${item.userName}${item.userEmail ? ` (${item.userEmail})` : ""}</small>
            <small>${item.errorMessage || "Unknown upload error"}</small>
          </div>
          <strong>${formatDate(item.updatedAt)}</strong>
        </div>
      `
    )
    .join("");
}

async function loadAdminAnalytics() {
  if (state.user?.role !== "admin") {
    return;
  }

  try {
    const data = await apiFetch("/admin/analytics");
    renderMetricCards(data.metrics);
    renderDailyPostsChart(data.charts.dailyPosts || []);
    renderTopHashtags(data.topHashtags || []);
    renderRecentFailures(data.recentFailures || []);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadPosts() {
  try {
    const { posts } = await apiFetch("/posts");
    if (!posts.length) {
      postList.innerHTML = "<p>No scheduled posts yet.</p>";
      return;
    }

    postList.innerHTML = posts
      .map(
        (post) => `
          <article class="post-card">
            <div class="post-meta">
              <span class="status ${post.status}">${post.status}</span>
              <span>Scheduled: ${formatDate(post.scheduledAt)}</span>
              <span>Uploaded: ${formatDate(post.uploadDate)}</span>
            </div>
            <div>
              <h3>${post.title}</h3>
              <p>${post.description || "No description provided."}</p>
              <p>${(post.hashtags || []).map((tag) => `#${tag}`).join(" ")}</p>
              ${post.videoUrl ? `<a href="${post.videoUrl}" target="_blank" rel="noopener">Open stored video</a>` : ""}
              ${post.errorMessage ? `<p class="error">${post.errorMessage}</p>` : ""}
            </div>
            <div class="post-actions">
              ${post.status !== "posted" ? `<button data-action="edit" data-id="${post._id}">Edit</button>` : ""}
              <button class="ghost" data-action="delete" data-id="${post._id}">Delete</button>
              ${post.youtubeVideoId ? `<a href="https://www.youtube.com/watch?v=${post.youtubeVideoId}" target="_blank" rel="noopener">View on YouTube</a>` : ""}
            </div>
          </article>
        `
      )
      .join("");

    postList.querySelectorAll("[data-action='edit']").forEach((button) => {
      button.addEventListener("click", () => {
        const post = posts.find((item) => item._id === button.dataset.id);
        fillFormForEdit(post);
      });
    });

    postList.querySelectorAll("[data-action='delete']").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this post?")) return;
        await apiFetch(`/posts/${button.dataset.id}`, { method: "DELETE" });
        showToast("Post deleted");
        loadPosts();
      });
    });
  } catch (error) {
    showToast(error.message);
  }
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(registerForm).entries());

  try {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify(formData)
    });
    saveSession(data.token, data.user);
    showToast("Account created");
  } catch (error) {
    showToast(error.message);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify(formData)
    });
    saveSession(data.token, data.user);
    showToast("Logged in");
  } catch (error) {
    showToast(error.message);
  }
});

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  uploadProgress.classList.remove("hidden");

  try {
    if (state.editingId) {
      const payload = {
        title: postForm.title.value,
        description: postForm.description.value,
        hashtags: postForm.hashtags.value,
        privacyStatus: postForm.privacyStatus.value,
        scheduledAt: postForm.scheduledAt.value
      };
      await apiFetch(`/posts/${state.editingId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      showToast("Post updated");
    } else {
      const file = postForm.video.files[0];
      if (!file) {
        throw new Error("Please select a video file");
      }

      // Shorts should be 60 seconds or less for this MVP.
      const duration = await getVideoDuration(file);
      if (duration > 60) {
        throw new Error("Video must be 60 seconds or less");
      }

      const formData = new FormData(postForm);
      await apiFetch("/posts", {
        method: "POST",
        body: formData
      });
      showToast("Post scheduled");
    }

    resetPostForm();
    loadPosts();
  } catch (error) {
    showToast(error.message);
  } finally {
    uploadProgress.classList.add("hidden");
  }
});

connectYoutubeBtn.addEventListener("click", async () => {
  try {
    const { url } = await apiFetch("/youtube/auth-url");
    window.location.href = url;
  } catch (error) {
    showToast(error.message);
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showToast("Logged out");
});

window.addEventListener("load", async () => {
  const url = new URL(window.location.href);
  if (url.searchParams.get("youtube") === "connected") {
    showToast("YouTube account connected");
    window.history.replaceState({}, "", window.location.pathname);
  }

  if (state.token) {
    try {
      const { user } = await apiFetch("/auth/me");
      state.user = user;
      localStorage.setItem("autopost_user", JSON.stringify(user));
    } catch (_error) {
      clearSession();
    }
  }

  renderSession();
});
