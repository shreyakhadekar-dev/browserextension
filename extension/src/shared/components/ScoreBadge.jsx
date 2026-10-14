import { riskVar } from "../format.js";

export default function ScoreBadge({ score, label, size = "md" }) {
  const color = `var(${riskVar(label)})`;
  const bg = `var(${riskVar(label)}-bg)`;
  const dims = size === "lg" ? { pad: "6px 12px", font: 20 } : { pad: "3px 9px", font: 13 };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        padding: dims.pad,
        borderRadius: 999,
        background: bg,
        color,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span className="mono" style={{ fontSize: dims.font, fontWeight: 700 }}>
        {score}
      </span>
      <span style={{ fontSize: dims.font * 0.6, letterSpacing: "0.02em" }}>{label}</span>
    </span>
  );
}
