import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, RefreshCw, ExternalLink, WifiOff } from "lucide-react";
import { getLatest, scanNow } from "../shared/api.js";
import { formatRelativeTime } from "../shared/format.js";
import RiskCountChip from "../shared/components/RiskCountChip.jsx";
import ExtensionRow from "./components/ExtensionRow.jsx";
import { EmptyState, LoadingState } from "./components/EmptyState.jsx";

export default function App() {
  const [results, setResults] = useState(null); // array
  const [scannedAt, setScannedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const loadCached = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: cachedError } = await getLatest();
      if (data) {
        setResults(data.results);
        setScannedAt(data.scannedAt);
      }
      if (cachedError) setError(cachedError);
      if (!data && !cachedError) {
        // No cache yet (first run) - kick off an initial scan.
        await handleScan();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    try {
      const data = await scanNow();
      setResults(data.results);
      setScannedAt(data.scannedAt);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    loadCached();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...(results || [])].sort((a, b) => b.compositeScore - a.compositeScore);
  const counts = { High: 0, Medium: 0, Low: 0 };
  for (const ext of sorted) counts[ext.riskLabel] = (counts[ext.riskLabel] || 0) + 1;

  return (
    <div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 12px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <ShieldCheck size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Extension Risk Auditor</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Last scan: {scannedAt ? formatRelativeTime(scannedAt) : "never"}
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: scanning ? "var(--surface-raised)" : "var(--accent-bg)",
            color: scanning ? "var(--text-muted)" : "var(--accent-text)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={12} style={{ animation: scanning ? "spin 1s linear infinite" : "none" }} />
          {scanning ? "Scanning…" : "Scan now"}
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </header>

      {error && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            margin: "10px 12px 0",
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            background: "var(--risk-high-bg)",
            color: "var(--risk-high)",
            fontSize: 11.5,
          }}
        >
          <WifiOff size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {loading && !results ? (
        <LoadingState />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No extensions found"
          subtitle="Install a couple of extensions, then hit Scan now."
        />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, padding: "12px" }}>
            <RiskCountChip label="High" count={counts.High} />
            <RiskCountChip label="Medium" count={counts.Medium} />
            <RiskCountChip label="Low" count={counts.Low} />
          </div>
          <div>
            {sorted.map((ext) => (
              <ExtensionRow key={ext.extensionId} ext={ext} />
            ))}
          </div>
        </>
      )}

      <footer style={{ padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            justifyContent: "center",
            padding: "8px",
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          Open full dashboard <ExternalLink size={12} />
        </button>
      </footer>
    </div>
  );
}
