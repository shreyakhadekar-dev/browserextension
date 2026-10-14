import { useState } from "react";
import { Search } from "lucide-react";
import ScoreBadge from "../../shared/components/ScoreBadge.jsx";
import { riskVar } from "../../shared/format.js";

const FILTERS = ["All", "High", "Medium", "Low"];

export default function Sidebar({ extensions, selectedId, onSelect }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");

  const filtered = extensions.filter((ext) => {
    const matchesQuery = ext.name.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All" || ext.riskLabel === filter;
    return matchesQuery && matchesFilter;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 9, top: 9, color: "var(--text-faint)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search extensions"
            style={{
              width: "100%",
              padding: "7px 10px 7px 30px",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              fontSize: 12.5,
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                flex: 1,
                padding: "5px 0",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 999,
                border: `1px solid ${filter === f ? "var(--accent)" : "var(--border)"}`,
                background: filter === f ? "var(--accent-bg)" : "transparent",
                color: filter === f ? "var(--accent-text)" : "var(--text-muted)",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
            No extensions match.
          </div>
        )}
        {filtered.map((ext) => {
          const isSelected = ext.extensionId === selectedId;
          const color = `var(${riskVar(ext.riskLabel)})`;
          return (
            <button
              key={ext.extensionId}
              onClick={() => onSelect(ext.extensionId)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                background: isSelected ? "var(--surface-raised)" : "transparent",
                border: "none",
                borderLeft: `3px solid ${isSelected ? color : "transparent"}`,
                borderBottom: "1px solid var(--border-soft)",
                textAlign: "left",
                color: "var(--text)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ext.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{ext.installType}</div>
              </div>
              <ScoreBadge score={ext.compositeScore} label={ext.riskLabel} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
