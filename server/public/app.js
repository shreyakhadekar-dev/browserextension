// SentinelAudit • Client-Side Interactive Engine

const PERMISSION_WEIGHTS = {
  debugger: { weight: 10, reason: "can control the browser debugger and inspect all execution" },
  proxy: { weight: 10, reason: "can intercept and redirect all browser web traffic" },
  nativeMessaging: { weight: 10, reason: "can execute native binary applications outside the sandbox" },
  webRequestBlocking: { weight: 10, reason: "can block and alter network requests before transmission" },
  webRequest: { weight: 9, reason: "can inspect all in-flight network headers and traffic" },
  declarativeNetRequest: { weight: 8, reason: "can modify headers and block network requests declaratively" },
  cookies: { weight: 7, reason: "can extract session cookies and auth tokens" },
  management: { weight: 7, reason: "can inspect, disable, and uninstall other extensions" },
  scripting: { weight: 6, reason: "can inject arbitrary code into target web pages" },
  tabs: { weight: 5, reason: "can access open tab URLs and sensitive titles" },
  clipboardRead: { weight: 4, reason: "can silently read contents of your system clipboard" },
  clipboardWrite: { weight: 2, reason: "can overwrite clipboard data" },
  contextMenus: { weight: 2, reason: "adds items to the browser right-click menu" },
  storage: { weight: 1, reason: "stores persistent configuration locally" },
  alarms: { weight: 1, reason: "schedules recurring background timer events" },
  unlimitedStorage: { weight: 2, reason: "can allocate unbounded local disk storage" }
};

let allExtensions = [];
let currentFilter = "all";
let searchQuery = "";
let currentUser = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  initHealthCheck();
  initAuth();
  loadLiveExtensions();
  initSimulator();
  initCopyPath();
});

// Toast Helper
function showToast(message, duration = 3000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), duration);
}

// 1. Health & Database Check
async function initHealthCheck() {
  const pill = document.getElementById("api-status-pill");
  const dot = pill.querySelector(".status-dot");
  const text = pill.querySelector(".status-text");
  const footerDb = document.getElementById("footer-db-status");

  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Unhealthy");
    const data = await res.json();
    dot.className = "status-dot connected";
    text.textContent = "PostgreSQL Ready";
    footerDb.textContent = "Postgres (Connected)";
  } catch (err) {
    dot.className = "status-dot error";
    text.textContent = "DB Offline";
    footerDb.textContent = "Disconnected";
  }
}

// 2. Fetch and Render Live Extensions
async function loadLiveExtensions() {
  const grid = document.getElementById("extensions-cards-grid");
  try {
    const res = await fetch("/api/extensions");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allExtensions = data.extensions || [];
    updateMetrics(allExtensions);
    renderCards();
  } catch (err) {
    grid.innerHTML = `
      <div class="loading-state">
        <p style="color:var(--risk-high);">Failed to load extensions from database (${err.message}). Ensure server is running.</p>
      </div>
    `;
  }
}

function updateMetrics(list) {
  document.getElementById("stat-total-extensions").textContent = list.length;
  const highRiskCount = list.filter(e => e.riskLabel === "High").length;
  document.getElementById("stat-high-risk").textContent = highRiskCount;

  if (list.length > 0) {
    const totalScore = list.reduce((acc, e) => acc + Number(e.compositeScore || 0), 0);
    const avg = Math.round(totalScore / list.length);
    document.getElementById("stat-avg-score").textContent = avg + "/100";
  } else {
    document.getElementById("stat-avg-score").textContent = "--";
  }

  const allDomains = new Set();
  list.forEach(e => (e.observedDomains || []).forEach(d => allDomains.add(d)));
  document.getElementById("stat-domains-count").textContent = allDomains.size;
}

function renderCards() {
  const grid = document.getElementById("extensions-cards-grid");
  let filtered = allExtensions.filter(e => {
    if (currentFilter !== "all" && e.riskLabel !== currentFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (e.name || "").toLowerCase().includes(q);
      const matchPerm = (e.permissions || []).some(p => p.toLowerCase().includes(q));
      return matchName || matchPerm;
    }
    return true;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="loading-state">
        <p>No extensions match your current filter criteria.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(ext => {
    const riskClass = (ext.riskLabel || "low").toLowerCase();
    const dateFormatted = ext.checkedAt ? new Date(ext.checkedAt).toLocaleDateString() : "Recent";
    const permCount = (ext.permissions || []).length;
    const hostCount = (ext.hostPermissions || []).length;
    const domainCount = (ext.observedDomains || []).length;

    const reasonsHtml = (ext.reasons && ext.reasons.length > 0)
      ? ext.reasons.slice(0, 3).map(r => `
          <div class="ext-reason-item">
            <span class="ext-reason-bullet">▸</span>
            <span>${escapeHtml(r)}</span>
          </div>
        `).join("")
      : `<div class="ext-reason-item"><span>No critical risk flags observed.</span></div>`;

    return `
      <div class="ext-card">
        <div class="ext-card-header">
          <div class="ext-title-group">
            <h3>${escapeHtml(ext.name)}</h3>
            <div class="ext-meta-tags">
              <span class="tag">v${escapeHtml(ext.version || "1.0")}</span>
              <span class="tag ${ext.installType === 'sideload' ? 'tag-sideload' : ''}">${escapeHtml(ext.installType || 'normal')}</span>
            </div>
          </div>
          <div class="score-badge ${riskClass}">
            <span class="score-num mono">${Math.round(ext.compositeScore)}</span>
            <span class="score-label">${ext.riskLabel}</span>
          </div>
        </div>

        <div class="ext-stats-row mono">
          <div>
            <div class="ext-stat-num">${permCount}</div>
            <div class="ext-stat-lbl">Permissions</div>
          </div>
          <div>
            <div class="ext-stat-num">${hostCount}</div>
            <div class="ext-stat-lbl">Host Grants</div>
          </div>
          <div>
            <div class="ext-stat-num">${domainCount}</div>
            <div class="ext-stat-lbl">Domains</div>
          </div>
        </div>

        <div class="ext-reasons-box">
          <div class="ext-reasons-title">Risk Diagnostic</div>
          ${reasonsHtml}
        </div>

        <div class="ext-card-footer">
          <span class="checked-at-text">Audited: ${dateFormatted}</span>
          <button class="btn btn-outline" style="padding:4px 10px; font-size:12px;" onclick="viewHistory('${escapeHtml(ext.extensionId)}')">
            Audit Trail
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// Filter listeners
document.querySelectorAll(".risk-pills .pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".risk-pills .pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderCards();
  });
});

document.getElementById("filter-search").addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderCards();
});

// View History Modal
window.viewHistory = async function(extensionId) {
  const modal = document.getElementById("detail-modal");
  const content = document.getElementById("detail-modal-content");
  modal.classList.add("open");
  content.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching audit trail for ${escapeHtml(extensionId)}…</p></div>`;

  try {
    const res = await fetch(`/api/extensions/${encodeURIComponent(extensionId)}/history`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const history = data.history || [];

    const rows = history.map((h, i) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border); font-size:13px;">
        <div>
          <strong>Scan #${i + 1}</strong> • <span class="mono">${new Date(h.checkedAt).toLocaleString()}</span>
          <div style="color:var(--text-muted); font-size:12px; margin-top:2px;">
            Perms: ${(h.permissions || []).join(", ") || "none"}
          </div>
        </div>
        <div class="score-badge ${(h.riskLabel || "low").toLowerCase()}" style="padding:4px 8px; font-size:12px;">
          ${Math.round(h.compositeScore)} ${h.riskLabel}
        </div>
      </div>
    `).join("");

    content.innerHTML = `
      <h3 style="margin-bottom:8px; font-size:18px;">Audit History Trail</h3>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:18px;">
        Extension ID: <code class="mono">${escapeHtml(extensionId)}</code> (${history.length} recorded scan${history.length > 1 ? 's' : ''})
      </p>
      <div style="background:var(--bg-subtle); border:1px solid var(--border); border-radius:var(--radius-sm); max-height:360px; overflow-y:auto;">
        ${rows}
      </div>
      <div style="margin-top:20px; display:flex; justify-content:flex-end;">
        <a href="/dashboard/options.html" target="_blank" class="btn btn-primary" style="font-size:12px;">Open Full React Dashboard</a>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<p style="color:var(--risk-high);">Failed to load history: ${err.message}</p>`;
  }
};

document.getElementById("close-detail-modal").addEventListener("click", () => {
  document.getElementById("detail-modal").classList.remove("open");
});

// 3. Interactive Risk Simulator
function initSimulator() {
  const grid = document.getElementById("sim-permissions-grid");
  grid.innerHTML = Object.entries(PERMISSION_WEIGHTS).map(([perm, meta]) => `
    <label class="perm-checkbox-item">
      <input type="checkbox" name="sim-perm" value="${perm}">
      <span>${perm}</span>
      <span class="perm-weight-pill ${meta.weight >= 8 ? 'high' : ''}">+${meta.weight}</span>
    </label>
  `).join("");

  // Input listeners
  document.querySelectorAll('input[name="sim-perm"], input[name="sim-host"]').forEach(el => {
    el.addEventListener("change", recalculateSimulator);
  });
  document.getElementById("sim-domains").addEventListener("input", recalculateSimulator);

  // Preset selector
  document.getElementById("preset-select").addEventListener("change", (e) => {
    applyPreset(e.target.value);
  });

  // Reset
  document.getElementById("sim-reset-btn").addEventListener("click", () => {
    applyPreset("custom");
    document.getElementById("preset-select").value = "custom";
  });

  // Submit to DB
  document.getElementById("sim-submit-db-btn").addEventListener("click", submitSimulatorToDatabase);

  recalculateSimulator();
}

function applyPreset(presetKey) {
  const permCheckboxes = document.querySelectorAll('input[name="sim-perm"]');
  permCheckboxes.forEach(cb => cb.checked = false);
  const hostRadios = document.querySelectorAll('input[name="sim-host"]');

  if (presetKey === "overprivileged-adblocker") {
    document.getElementById("sim-name").value = "AdGuard Plus Simulator";
    ["storage", "webRequest", "declarativeNetRequest"].forEach(p => {
      const cb = document.querySelector(`input[name="sim-perm"][value="${p}"]`);
      if (cb) cb.checked = true;
    });
    hostRadios.forEach(r => r.checked = (r.value === "all_urls"));
    document.getElementById("sim-domains").value = "api.adserver-check.com, tracking.evil.org";
  } else if (presetKey === "rogue-vpn") {
    document.getElementById("sim-name").value = "UltraVPN Proxy Extension";
    ["proxy", "webRequestBlocking", "webRequest", "cookies", "management"].forEach(p => {
      const cb = document.querySelector(`input[name="sim-perm"][value="${p}"]`);
      if (cb) cb.checked = true;
    });
    hostRadios.forEach(r => r.checked = (r.value === "all_urls"));
    document.getElementById("sim-domains").value = "traffic-relay-node.ru, data-collector.biz";
  } else if (presetKey === "safe-notes") {
    document.getElementById("sim-name").value = "Markdown Scratchpad";
    ["storage", "alarms"].forEach(p => {
      const cb = document.querySelector(`input[name="sim-perm"][value="${p}"]`);
      if (cb) cb.checked = true;
    });
    hostRadios.forEach(r => r.checked = (r.value === "none"));
    document.getElementById("sim-domains").value = "";
  } else if (presetKey === "stealth-keylogger") {
    document.getElementById("sim-name").value = "Dark Mode Helper";
    ["debugger", "cookies", "clipboardRead"].forEach(p => {
      const cb = document.querySelector(`input[name="sim-perm"][value="${p}"]`);
      if (cb) cb.checked = true;
    });
    hostRadios.forEach(r => r.checked = (r.value === "specific"));
    document.getElementById("sim-domains").value = "exfil-credentials-beacon.cc";
  } else {
    document.getElementById("sim-name").value = "Custom Security Inspection";
    hostRadios.forEach(r => r.checked = (r.value === "none"));
    document.getElementById("sim-domains").value = "";
  }

  recalculateSimulator();
}

function recalculateSimulator() {
  const selectedPerms = Array.from(document.querySelectorAll('input[name="sim-perm"]:checked')).map(cb => cb.value);
  const selectedHost = document.querySelector('input[name="sim-host"]:checked')?.value || "none";
  const domainInput = document.getElementById("sim-domains").value;
  const domains = domainInput.split(",").map(d => d.trim()).filter(Boolean);

  // Scoring engine algorithm matching server/src/scoring/scoreEngine.js
  let rawPermWeight = 0;
  const reasons = [];

  selectedPerms.forEach(perm => {
    const meta = PERMISSION_WEIGHTS[perm];
    if (meta) {
      rawPermWeight += meta.weight;
      if (meta.weight >= 5) {
        reasons.push(meta.reason);
      }
    }
  });

  if (selectedHost === "all_urls") {
    rawPermWeight += 10;
    reasons.unshift("can read and alter data on every website you visit (<all_urls>)");
  } else if (selectedHost === "specific") {
    rawPermWeight += 5;
    reasons.push("can read and inject code into specific configured web origins");
  }

  // Normalized baseline (scale 0-100)
  const permissionScore = Math.min(100, Math.round((rawPermWeight / 28) * 100));

  // Runtime adjustment (+5 per unfamiliar domain, cap at +25)
  const runtimeAdj = Math.min(25, domains.length * 5);
  if (domains.length > 0) {
    reasons.push(`contacted ${domains.length} unfamiliar outbound domain${domains.length > 1 ? 's' : ''}`);
  }

  const compositeScore = Math.min(100, permissionScore + runtimeAdj);

  // Risk label
  let riskLabel = "Low";
  let riskColor = "var(--risk-low)";
  let riskSummary = "Declared minimal permissions without elevated blast radius.";

  if (compositeScore >= 70) {
    riskLabel = "High";
    riskColor = "var(--risk-high)";
    riskSummary = "High-risk privileges: potential for data theft, code injection, or proxy interception.";
  } else if (compositeScore >= 40) {
    riskLabel = "Medium";
    riskColor = "var(--risk-medium)";
    riskSummary = "Moderate blast radius: can inspect page contents or active browsing sessions.";
  }

  // Update UI Elements
  document.getElementById("sim-score-val").textContent = compositeScore;
  document.getElementById("sim-perm-score").textContent = `${permissionScore} / 100`;
  document.getElementById("sim-runtime-adj").textContent = `+${runtimeAdj} / 25`;
  document.getElementById("sim-composite-score").textContent = compositeScore;

  const badge = document.getElementById("sim-risk-label");
  badge.textContent = riskLabel;
  badge.style.background = riskLabel === "High" ? "var(--risk-high-bg)" : riskLabel === "Medium" ? "var(--risk-medium-bg)" : "var(--risk-low-bg)";
  badge.style.color = riskColor;
  badge.style.borderColor = riskColor;

  document.getElementById("sim-risk-summary").textContent = riskSummary;

  // Animated Gauge circle: circumference is 2 * PI * 50 = 314
  const offset = 314 - (314 * (compositeScore / 100));
  const gaugeBar = document.getElementById("sim-gauge-bar");
  gaugeBar.style.strokeDashoffset = offset;
  gaugeBar.style.stroke = riskColor;

  // Reasons list
  const reasonsList = document.getElementById("sim-reasons-list");
  if (reasons.length === 0) {
    reasonsList.innerHTML = "<li>No elevated risk flags detected.</li>";
  } else {
    reasonsList.innerHTML = reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("");
  }
}

async function submitSimulatorToDatabase() {
  const name = document.getElementById("sim-name").value.trim() || "Simulation Extension";
  const selectedPerms = Array.from(document.querySelectorAll('input[name="sim-perm"]:checked')).map(cb => cb.value);
  const selectedHost = document.querySelector('input[name="sim-host"]:checked')?.value || "none";
  const domainInput = document.getElementById("sim-domains").value;
  const domains = domainInput.split(",").map(d => d.trim()).filter(Boolean);

  const hostPermissions = selectedHost === "all_urls" ? ["<all_urls>"] : selectedHost === "specific" ? ["https://*.example.com/*"] : [];
  const simId = "sim-" + Math.random().toString(36).substring(2, 9);

  const payload = {
    extensions: [
      {
        id: simId,
        name: name,
        version: "1.0." + Math.floor(Math.random() * 10),
        installType: "development",
        enabled: true,
        permissions: selectedPerms,
        hostPermissions: hostPermissions,
        observedDomains: domains
      }
    ]
  };

  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showToast(`Saved "${name}" audit to PostgreSQL registry!`);
    await loadLiveExtensions();
    // Scroll to live audits
    document.getElementById("live-audits").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showToast(`Failed to save audit: ${err.message}`);
  }
}

// 4. Authentication System
function initAuth() {
  const modal = document.getElementById("auth-modal");
  const openBtn = document.getElementById("open-auth-btn");
  const closeBtn = document.getElementById("close-auth-modal");
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  if (openBtn) openBtn.addEventListener("click", () => modal.classList.add("open"));
  if (closeBtn) closeBtn.addEventListener("click", () => modal.classList.remove("open"));

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.add("active");
    registerForm.classList.remove("active");
  });

  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.classList.add("active");
    loginForm.classList.remove("active");
  });

  // Login Submit
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const alert = document.getElementById("login-alert");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      localStorage.setItem("sentinel_token", data.token);
      currentUser = data.user;
      renderUserHeader();
      modal.classList.remove("open");
      showToast(`Welcome back, ${currentUser.name}!`);
    } catch (err) {
      alert.style.display = "block";
      alert.className = "auth-alert error";
      alert.textContent = err.message;
    }
  });

  // Demo Login Button
  document.getElementById("demo-login-btn").addEventListener("click", async () => {
    document.getElementById("login-email").value = "analyst@sentinel.sec";
    document.getElementById("login-password").value = "Password123!";
    loginForm.dispatchEvent(new Event("submit"));
  });

  // Register Submit
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    const role = document.getElementById("reg-role").value;
    const alert = document.getElementById("register-alert");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      localStorage.setItem("sentinel_token", data.token);
      currentUser = data.user;
      renderUserHeader();
      modal.classList.remove("open");
      showToast(`Account created! Welcome, ${currentUser.name}`);
    } catch (err) {
      alert.style.display = "block";
      alert.className = "auth-alert error";
      alert.textContent = err.message;
    }
  });

  // Check existing token
  checkSession();
}

async function checkSession() {
  const token = localStorage.getItem("sentinel_token");
  if (!token) return;

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      renderUserHeader();
    } else {
      localStorage.removeItem("sentinel_token");
    }
  } catch {
    // offline or error
  }
}

function renderUserHeader() {
  const container = document.getElementById("auth-header-container");
  if (!currentUser) {
    container.innerHTML = `
      <button class="btn btn-primary" id="open-auth-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Sign In</span>
      </button>
    `;
    document.getElementById("open-auth-btn").addEventListener("click", () => {
      document.getElementById("auth-modal").classList.add("open");
    });
    return;
  }

  const initials = currentUser.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  container.innerHTML = `
    <div class="user-chip">
      <div class="user-avatar-circle">${escapeHtml(initials)}</div>
      <span class="user-name-text">${escapeHtml(currentUser.name)}</span>
      <button class="logout-link-btn" title="Sign out" onclick="logout()">✕</button>
    </div>
  `;
}

window.logout = function() {
  localStorage.removeItem("sentinel_token");
  currentUser = null;
  renderUserHeader();
  showToast("Signed out successfully.");
};

// 5. Copy Path Helper
function initCopyPath() {
  const btn = document.getElementById("copy-path-btn");
  const pathText = document.getElementById("build-path-text").textContent;
  const label = document.getElementById("copy-btn-text");

  btn.addEventListener("click", () => {
    navigator.clipboard.writeText(pathText).then(() => {
      label.textContent = "Copied!";
      setTimeout(() => label.textContent = "Copy Path", 2000);
      showToast("Extension build path copied to clipboard!");
    });
  });
}

// Utility: HTML Escaping
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
