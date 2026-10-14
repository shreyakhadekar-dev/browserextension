import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, RefreshCw, Settings2 } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import { fetchExtensions, scanNow, getApiBase, setApiBase } from "../shared/api.js";

export default function App() {
  const [extensions, setExtensions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExtensions();
      const ranked = data.extensions;
      setExtensions(ranked);
      setSelectedId((current) => current || ranked[0]?.extensionId || null);
    } catch (err) {
      setError(
        `Couldn't load scores from the API (${err.message}). Make sure the server is running, then Rescan.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    getApiBase().then(setApiBaseInput);
  }, [load]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await scanNow();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const selected = extensions.find((e) => e.extensionId === selectedId) || null;

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 300, borderRight: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 14px 0" }}>
          <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Extension Risk Auditor</div>
        </div>
        <Sidebar extensions={extensions} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "14px 24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setShowSettings((v) => !v)}
            title="API settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 10px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            <Settings2 size={13} />
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: scanning ? "var(--surface-raised)" : "var(--accent-bg)",
              color: scanning ? "var(--text-muted)" : "var(--accent-text)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <RefreshCw size={13} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
            {scanning ? "Rescanning…" : "Rescan all"}
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>

        {showSettings && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 24px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Backend API URL</span>
            <input
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
              style={{
                flex: 1,
                maxWidth: 320,
                padding: "6px 9px",
                background: "var(--surface-raised)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 12,
              }}
              className="mono"
            />
            <button
              onClick={async () => {
                await setApiBase(apiBaseInput);
                setShowSettings(false);
                load();
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--accent)",
                background: "var(--accent-bg)",
                color: "var(--accent-text)",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Save
            </button>
          </div>
        )}

        {error && (
          <div style={{ margin: "16px 24px 0", padding: "10px 14px", borderRadius: 8, background: "var(--risk-high-bg)", color: "var(--risk-high)", fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : selected ? (
          <DetailPanel extension={selected} />
        ) : (
          <div style={{ padding: 40, color: "var(--text-muted)", fontSize: 13 }}>
            No extensions scored yet. Click "Rescan all" to run the first scan.
          </div>
        )}
      </div>
    </div>
  );
}
