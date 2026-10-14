import { ShieldAlert, Loader2 } from "lucide-react";

export function EmptyState({ icon: Icon = ShieldAlert, title, subtitle }) {
  return (
    <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-muted)" }}>
      <Icon size={26} style={{ marginBottom: 10, color: "var(--text-faint)" }} />
      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12 }}>{subtitle}</div>}
    </div>
  );
}

export function LoadingState({ label = "Scanning installed extensions…" }) {
  return (
    <div style={{ padding: "36px 20px", textAlign: "center", color: "var(--text-muted)" }}>
      <Loader2 size={22} className="spin" style={{ marginBottom: 10, color: "var(--accent)" }} />
      <div style={{ fontSize: 12 }}>{label}</div>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
