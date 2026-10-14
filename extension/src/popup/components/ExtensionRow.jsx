import { useState } from "react";
import { ChevronRight } from "lucide-react";
import ScoreBadge from "../../shared/components/ScoreBadge.jsx";
import { riskVar } from "../../shared/format.js";

function PermissionBar({ item, maxWeight }) {
  const pct = Math.max(6, Math.round((item.weight / maxWeight) * 100));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 34px", alignItems: "center", gap: 8, marginBottom: 5 }}>
      <div>
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.key}
        </div>
        <div style={{ height: 4, background: "var(--border-soft)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)" }} />
        </div>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
        {item.weight}
      </div>
    </div>
  );
}

export default function ExtensionRow({ ext }) {
  const [open, setOpen] = useState(false);
  const color = `var(${riskVar(ext.riskLabel)})`;
  const maxWeight = Math.max(1, ...(ext.scoreBreakdown || []).map((b) => b.weight));
  const topBreakdown = (ext.scoreBreakdown || []).slice(0, 5);

  return (
    <div style={{ borderBottom: "1px solid var(--border-soft)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px 10px 10px",
          background: "transparent",
          border: "none",
          borderLeft: `3px solid ${color}`,
          textAlign: "left",
          color: "var(--text)",
        }}
      >
        <ChevronRight
          size={14}
          style={{
            color: "var(--text-faint)",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 120ms ease",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ext.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
            {ext.version ? <span className="mono">v{ext.version}</span> : null}
            {ext.previous && ext.previous.delta !== 0 ? (
              <span style={{ marginLeft: 6, color: ext.previous.delta > 0 ? "var(--risk-high)" : "var(--risk-low)" }}>
                {ext.previous.delta > 0 ? "▲" : "▼"} {Math.abs(ext.previous.delta)} since last check
              </span>
            ) : null}
          </div>
        </div>
        <ScoreBadge score={ext.compositeScore} label={ext.riskLabel} />
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px 27px" }}>
          <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none" }}>
            {(ext.reasons || []).map((reason, i) => (
              <li
                key={i}
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  paddingLeft: 12,
                  position: "relative",
                  marginBottom: 3,
                }}
              >
                <span style={{ position: "absolute", left: 0, color: "var(--text-faint)" }}>–</span>
                {reason}
              </li>
            ))}
          </ul>

          {topBreakdown.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>Score breakdown</div>
              {topBreakdown.map((item, i) => (
                <PermissionBar key={i} item={item} maxWeight={maxWeight} />
              ))}
            </div>
          )}

          {(ext.observedDomainCount ?? 0) > 0 && (
            <div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
                Observed domains ({ext.observedDomainCount})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(ext.unfamiliarDomains || []).map((d) => (
                  <span
                    key={d}
                    className="mono"
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--risk-medium-bg)",
                      color: "var(--risk-medium)",
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
