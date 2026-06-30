"use client";

import { signed } from "@/lib/format";

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  delta?: number;
  betterWhenLower?: boolean;
  deltaSuffix?: string;
}

export function MetricCard({ label, value, unit, delta, betterWhenLower, deltaSuffix = "" }: Props) {
  let color = "var(--muted)";
  if (delta !== undefined && delta !== 0) {
    const improved = betterWhenLower ? delta < 0 : delta > 0;
    color = improved ? "var(--good)" : "var(--bad)";
  }
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-semibold mono">{value}</span>
        {unit && <span className="text-sm" style={{ color: "var(--muted)" }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div className="mt-1 text-sm mono" style={{ color }}>
          {delta === 0 ? "no change" : signed(delta, deltaSuffix)}
        </div>
      )}
    </div>
  );
}
