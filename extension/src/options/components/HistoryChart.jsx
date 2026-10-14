import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatShortDate } from "../../shared/format.js";

export default function HistoryChart({ history }) {
  const data = (history || []).map((h) => ({
    checkedAt: h.checkedAt,
    label: formatShortDate(h.checkedAt),
    score: h.compositeScore,
  }));

  if (data.length < 2) {
    return (
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
        Only one check so far - re-scan later to see how this extension's score changes over time.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ left: -12, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--border-soft)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <ReferenceLine y={70} stroke="var(--risk-high)" strokeDasharray="3 3" strokeOpacity={0.4} />
        <ReferenceLine y={40} stroke="var(--risk-medium)" strokeDasharray="3 3" strokeOpacity={0.4} />
        <Tooltip
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--text)" }}
        />
        <Line type="monotone" dataKey="score" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
