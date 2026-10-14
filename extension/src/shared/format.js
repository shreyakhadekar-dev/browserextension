export function riskVar(label) {
  switch (label) {
    case "High":
      return "--risk-high";
    case "Medium":
      return "--risk-medium";
    default:
      return "--risk-low";
  }
}

export function formatRelativeTime(isoString) {
  if (!isoString) return "never";
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function formatShortDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
