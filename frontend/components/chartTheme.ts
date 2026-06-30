// Shared Recharts theme tokens so every chart matches the dark UI.

export const AXIS = { fill: "var(--muted)", fontSize: 11 };
export const GRID = "var(--border)";
export const TOOLTIP = {
  contentStyle: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--foreground)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--muted)" },
  itemStyle: { color: "var(--foreground)" },
  cursor: { fill: "rgba(148,163,184,0.08)" },
};

export const COLOR_MANUAL = "#64748b";
export const COLOR_OPT = "#22d3ee";
export const COLOR_GOOD = "#34d399";
export const COLOR_WARN = "#f59e0b";
