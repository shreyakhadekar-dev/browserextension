import { riskVar } from "../../shared/format.js";

const CENTER = 60;
const RADIUS = 50;

function pointOnArc(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER - RADIUS * Math.sin(rad),
  };
}

/** Semicircle gauge: 180deg (left, score 0) sweeping clockwise to 0deg (right, score 100). */
export default function ScoreGauge({ score, label }) {
  const sweep = 180 * (score / 100);
  const start = pointOnArc(180);
  const end = pointOnArc(180 - sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  const color = `var(${riskVar(label)})`;

  const fgPath =
    score > 0
      ? `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`
      : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg viewBox="0 0 120 68" width="200" height="114">
        <path
          d={`M ${pointOnArc(180).x} ${pointOnArc(180).y} A ${RADIUS} ${RADIUS} 0 0 1 ${pointOnArc(0).x} ${pointOnArc(0).y}`}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {fgPath && (
          <path d={fgPath} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
        )}
      </svg>
      <div style={{ marginTop: -34, textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 34, fontWeight: 700, color }}>
          {score}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: -4 }}>{label} risk</div>
      </div>
    </div>
  );
}
