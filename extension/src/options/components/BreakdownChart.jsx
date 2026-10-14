import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";

export default function BreakdownChart({ breakdown }) {
  const data = [...(breakdown || [])]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((b) => ({ name: b.key, weight: b.weight }));

  if (data.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No permissions contributed to this score.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--border-soft)" />
        <XAxis type="number" hide domain={[0, 10]} />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--surface-raised)" }}
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: "var(--text)" }}
          formatter={(value) => [value, "weight"]}
        />
        <Bar dataKey="weight" radius={[0, 4, 4, 0]} maxBarSize={14}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.weight >= 8 ? "var(--risk-high)" : entry.weight >= 4 ? "var(--risk-medium)" : "var(--accent)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
