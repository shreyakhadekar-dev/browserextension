import { useEffect, useState } from "react";
import { Shield, Globe, Clock, Power } from "lucide-react";
import ScoreGauge from "./ScoreGauge.jsx";
import BreakdownChart from "./BreakdownChart.jsx";
import HistoryChart from "./HistoryChart.jsx";
import { fetchHistory } from "../../shared/api.js";
import { describePermission } from "../../shared/permissionDescriptions.js";
import { formatShortDate, riskVar } from "../../shared/format.js";

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, color: "var(--text-muted)" }}>
        {Icon && <Icon size={13} />}
        <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function DetailPanel({ extension }) {
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setHistoryError(null);
    fetchHistory(extension.extensionId)
      .then((data) => {
        if (!cancelled) setHistory(data.history);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [extension.extensionId]);

  const allPermissions = [
    ...(extension.permissions || []).map((p) => ({ key: p, kind: "permission" })),
    ...(extension.hostPermissions || []).map((p) => ({ key: p, kind: "host" })),
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 780 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{extension.name}</h1>
          {extension.version && (
            <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              v{extension.version}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Power size={12} /> {extension.enabled ? "Enabled" : "Disabled"}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Shield size={12} /> {extension.installType}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={12} /> checked {formatShortDate(extension.checkedAt)}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
        <SectionCard title="Composite score">
          <ScoreGauge score={extension.compositeScore} label={extension.riskLabel} />
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 4 }}>
            {extension.permissionScore} permission + {extension.runtimeAdjustment} runtime
          </div>
        </SectionCard>

        <SectionCard title="Why this score">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {(extension.reasons || []).map((reason, i) => (
              <li key={i} style={{ fontSize: 13, paddingLeft: 14, position: "relative" }}>
                <span style={{ position: "absolute", left: 0, color: `var(${riskVar(extension.riskLabel)})` }}>–</span>
                {reason}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Permission score breakdown">
        <BreakdownChart breakdown={extension.scoreBreakdown} />
      </SectionCard>

      <SectionCard title="Composite score over time" icon={Clock}>
        {historyError ? (
          <div style={{ fontSize: 12, color: "var(--risk-high)" }}>{historyError}</div>
        ) : (
          <HistoryChart history={history} />
        )}
      </SectionCard>

      <SectionCard title={`Declared permissions (${allPermissions.length})`} icon={Shield}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {allPermissions.map((p, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: 10,
                fontSize: 12,
                paddingBottom: 8,
                borderBottom: i < allPermissions.length - 1 ? "1px solid var(--border-soft)" : "none",
              }}
            >
              <span className="mono" style={{ color: "var(--text)" }}>
                {p.key}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {describePermission(p.key) || (p.kind === "host" ? "Access to a specific site pattern" : "—")}
              </span>
            </div>
          ))}
          {allPermissions.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No permissions declared.</div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`Observed network domains (${extension.observedDomains?.length ?? 0})`} icon={Globe}>
        {(extension.observedDomains || []).length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
            No network activity attributable to this extension has been observed yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {extension.observedDomains.map((d) => {
              const unfamiliar = (extension.unfamiliarDomains || []).includes(d);
              return (
                <span
                  key={d}
                  className="mono"
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 5,
                    background: unfamiliar ? "var(--risk-medium-bg)" : "var(--surface-raised)",
                    color: unfamiliar ? "var(--risk-medium)" : "var(--text-muted)",
                    border: `1px solid ${unfamiliar ? "transparent" : "var(--border)"}`,
                  }}
                  title={unfamiliar ? "Not on the known-benign infrastructure list" : "Recognized infrastructure domain"}
                >
                  {d}
                </span>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
