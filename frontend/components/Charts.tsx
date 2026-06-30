"use client";

import { Utilization } from "@/lib/api";

interface BarRow {
  label: string;
  baseline: number;
  optimized: number;
  betterWhenLower?: boolean;
  unit?: string;
}

/** Grouped baseline-vs-optimized bars, one group per metric. */
export function BeforeAfterChart({ rows }: { rows: BarRow[] }) {
  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const max = Math.max(r.baseline, r.optimized, 1);
        const bw = (r.baseline / max) * 100;
        const ow = (r.optimized / max) * 100;
        return (
          <div key={r.label}>
            <div className="flex justify-between text-sm mb-1">
              <span style={{ color: "var(--muted)" }}>{r.label}</span>
            </div>
            <div className="space-y-1">
              <Bar value={r.baseline} widthPct={bw} color="#64748b" tag="Manual" unit={r.unit} />
              <Bar value={r.optimized} widthPct={ow} color="var(--accent)" tag="Optimized" unit={r.unit} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ value, widthPct, color, tag, unit }: {
  value: number; widthPct: number; color: string; tag: string; unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs" style={{ color: "var(--muted)" }}>{tag}</span>
      <div className="flex-1 h-6 rounded" style={{ background: "var(--panel-2)" }}>
        <div className="h-6 rounded flex items-center justify-end pr-2"
          style={{ width: `${Math.max(widthPct, 6)}%`, background: color }}>
          <span className="text-xs font-medium mono" style={{ color: "#06202b" }}>
            {value}{unit}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Per-technician utilization, baseline vs optimized, to show load balancing. */
export function UtilizationChart({ baseline, optimized }: {
  baseline: Utilization[]; optimized: Utilization[];
}) {
  const byTech = new Map<number, { name: string; b?: number; o?: number }>();
  for (const u of baseline) byTech.set(u.tech_id, { name: u.tech_name, b: u.utilization_pct });
  for (const u of optimized) {
    const e = byTech.get(u.tech_id) ?? { name: u.tech_name };
    e.o = u.utilization_pct;
    byTech.set(u.tech_id, e);
  }
  const rows = [...byTech.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="space-y-2">
      {rows.map(([id, r]) => (
        <div key={id} className="flex items-center gap-2 text-xs">
          <span className="w-16" style={{ color: "var(--muted)" }}>{r.name}</span>
          <div className="flex-1 grid grid-cols-1 gap-0.5">
            <Track pct={r.b ?? 0} color="#64748b" />
            <Track pct={r.o ?? 0} color="var(--accent)" />
          </div>
          <span className="w-24 text-right mono" style={{ color: "var(--muted)" }}>
            {(r.b ?? 0).toFixed(0)}% → {(r.o ?? 0).toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function Track({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded" style={{ background: "var(--panel-2)" }}>
      <div className="h-2 rounded" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}
