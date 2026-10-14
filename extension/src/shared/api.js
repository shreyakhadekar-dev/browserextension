// Thin wrapper around chrome.runtime messaging + direct backend fetches.
// Popup and options pages both import this so there's one source of truth
// for how the UI talks to the background service worker / API.

const DEFAULT_API_BASE = "http://localhost:4000";

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

/** Ask the background worker to run a fresh scan right now. */
export async function scanNow() {
  const res = await sendMessage({ type: "SCAN_NOW" });
  if (!res?.ok) throw new Error(res?.error || "Scan failed");
  return res.data;
}

/** Read the last cached scan result out of chrome.storage.local. */
export async function getLatest() {
  const res = await sendMessage({ type: "GET_LATEST" });
  if (!res?.ok) throw new Error(res?.error || "Failed to read cached results");
  return { data: res.data, error: res.error };
}

export async function getApiBase() {
  try {
    if (typeof chrome !== "undefined" && chrome?.storage?.local) {
      const { apiBase } = await chrome.storage.local.get("apiBase");
      return apiBase || DEFAULT_API_BASE;
    }
  } catch {}
  return DEFAULT_API_BASE;
}

export async function setApiBase(apiBase) {
  try {
    if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
      await sendMessage({ type: "SET_API_BASE", apiBase });
    }
  } catch {}
}

/** Direct read of the ranked extension list from the backend (used by the
 * options dashboard, which wants a slightly fresher / independently
 * refreshable view than the popup's cached-message flow). */
export async function fetchExtensions() {
  const apiBase = await getApiBase();
  const res = await fetch(`${apiBase}/api/extensions`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

export async function fetchHistory(extensionId) {
  const apiBase = await getApiBase();
  const res = await fetch(`${apiBase}/api/extensions/${encodeURIComponent(extensionId)}/history`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

export { DEFAULT_API_BASE };
