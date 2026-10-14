import { riskVar } from "../format.js";

export default function RiskCountChip({ label, count }) {
  const color = `var(${riskVar(label)})`;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-raised)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
        {count}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
