// Extension Risk Auditor - background service worker (Manifest V3)
//
// Responsibilities (mirrors Section 6 "Workflow Steps" of the project doc):
//   1. Data collection  - chrome.management.getAll() for declared permissions
//   2. Runtime signal   - chrome.webRequest to note which domains get
//                         contacted while a given (other) extension is active
//   3. Send to backend  - POST the combined payload to the Express API
//   4-6. Scoring, aggregation, storage all happen server-side.
//   7. Output           - popup.html / options.html read the results back
//                         out of chrome.storage.local.
//
// KNOWN LIMITATION (documented rather than hidden): chrome.webRequest can
// only attribute a request to an extension when that request's `initiator`
// is the extension's own background/service-worker context
// (chrome-extension://<id>). A request an extension makes by injecting a
// content script into a normal web page shows the *page's* origin as the
// initiator, not the extension's - the platform gives no reliable way for
// a third-party extension to attribute that traffic. This mirrors a real,
// known constraint of building this kind of tool on top of public
// WebExtension APIs, not a bug in the scoring logic itself.

const DEFAULT_API_BASE = "http://localhost:4000";
const RESCAN_ALARM = "periodicRescan";
const RESCAN_PERIOD_MINUTES = 360; // 6 hours - "re-check periodically" (Objective 5)
const MAX_DOMAINS_PER_EXTENSION = 40;
const PERSIST_DEBOUNCE_MS = 4000;

/** @type {Map<string, Set<string>>} extensionId -> observed hostnames */
const observedDomains = new Map();
let persistTimer = null;
let domainsLoaded = false;

async function loadObservedDomainsFromStorage() {
  if (domainsLoaded) return;
  const { observedDomainsByExtension } = await chrome.storage.local.get("observedDomainsByExtension");
  if (observedDomainsByExtension) {
    for (const [extId, domains] of Object.entries(observedDomainsByExtension)) {
      observedDomains.set(extId, new Set(domains));
    }
  }
  domainsLoaded = true;
}

function schedulePersistObservedDomains() {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    const plain = {};
    for (const [extId, set] of observedDomains.entries()) {
      plain[extId] = [...set];
    }
    await chrome.storage.local.set({ observedDomainsByExtension: plain });
  }, PERSIST_DEBOUNCE_MS);
}

function recordDomainForExtension(extensionId, hostname) {
  let set = observedDomains.get(extensionId);
  if (!set) {
    set = new Set();
    observedDomains.set(extensionId, set);
  }
  if (set.has(hostname)) return;
  if (set.size >= MAX_DOMAINS_PER_EXTENSION) return; // cap - this is a signal, not a full log
  set.add(hostname);
  schedulePersistObservedDomains();
}

/**
 * webRequest listener MUST be registered synchronously at top-level script
 * evaluation (not inside an async function or after an await) so that
 * Chrome correctly re-registers it when the service worker wakes up for
 * this event after being suspended.
 */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const initiator = details.initiator || details.originUrl;
    if (!initiator || !initiator.startsWith("chrome-extension://")) return;

    const extensionId = initiator.replace("chrome-extension://", "").split("/")[0];
    if (extensionId === chrome.runtime.id) return; // ignore our own network calls

    try {
      const hostname = new URL(details.url).hostname;
      if (hostname) {
        loadObservedDomainsFromStorage().then(() => recordDomainForExtension(extensionId, hostname));
      }
    } catch {
      // Malformed URL (rare, e.g. blob:/data: schemes) - ignore.
    }
  },
  { urls: ["<all_urls>"] }
);

function getManagedExtensions() {
  return new Promise((resolve) => {
    chrome.management.getAll((items) => {
      resolve(
        items.filter((item) => item.type === "extension" && item.id !== chrome.runtime.id)
      );
    });
  });
}

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  return apiBase || DEFAULT_API_BASE;
}

async function buildScanPayload() {
  await loadObservedDomainsFromStorage();
  const items = await getManagedExtensions();

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    version: item.version,
    installType: item.installType,
    enabled: item.enabled,
    permissions: item.permissions || [],
    hostPermissions: item.hostPermissions || [],
    observedDomains: [...(observedDomains.get(item.id) || [])],
  }));
}

/**
 * Collect current state, POST to the backend, and cache the response in
 * chrome.storage.local so popup/options can render without re-hitting the
 * network on every open.
 */
async function runScanAndReport() {
  const apiBase = await getApiBase();
  const extensions = await buildScanPayload();

  if (extensions.length === 0) {
    const empty = { scannedAt: new Date().toISOString(), results: [] };
    await chrome.storage.local.set({ latestResults: empty, lastScanError: null });
    return empty;
  }

  try {
    const response = await fetch(`${apiBase}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ extensions }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Server responded ${response.status}`);
    }

    const data = await response.json();
    await chrome.storage.local.set({ latestResults: data, lastScanError: null });
    return data;
  } catch (err) {
    const message =
      err instanceof TypeError
        ? `Couldn't reach the API at ${apiBase}. Is the server running (npm run dev in /server)?`
        : err.message;
    await chrome.storage.local.set({ lastScanError: message });
    throw new Error(message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RESCAN_ALARM, { periodInMinutes: RESCAN_PERIOD_MINUTES });
  // Small delay so the very first scan isn't racing extension startup.
  setTimeout(() => runScanAndReport().catch(() => {}), 3000);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RESCAN_ALARM, { periodInMinutes: RESCAN_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RESCAN_ALARM) {
    runScanAndReport().catch((err) => console.warn("Periodic rescan failed:", err.message));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCAN_NOW") {
    runScanAndReport()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }

  if (message?.type === "GET_LATEST") {
    chrome.storage.local.get(["latestResults", "lastScanError"]).then((stored) => {
      sendResponse({ ok: true, data: stored.latestResults || null, error: stored.lastScanError || null });
    });
    return true;
  }

  if (message?.type === "SET_API_BASE") {
    chrome.storage.local.set({ apiBase: message.apiBase }).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
