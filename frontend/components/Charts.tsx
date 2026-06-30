"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Utilization } from "@/lib/api";
import { AXIS, COLOR_MANUAL, COLOR_OPT, GRID, TOOLTIP } from "@/components/chartTheme";

interface BarRow {
  label: string;
  baseline: number;
  optimized: number;
  unit?: string;
}

/** Before/after as small multiples - one mini chart per metric, each on its own
 *  scale (metrics have very different magnitudes, so a shared axis would lie). */
export function BeforeAfterChart({ rows }: { rows: BarRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
            {r.label}{r.unit ? ` (${r.unit})` : ""}
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={[{ name: "Manual", v: r.baseline }, { name: "Optimized", v: r.optimized }]}
              margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} stroke={GRID} />
              <YAxis tick={AXIS} stroke={GRID} width={28} />
              <Tooltip {...TOOLTIP} />
              <Bar dataKey="v" name={r.label} radius={[4, 4, 0, 0]} isAnimationActive={false}
                fill={COLOR_OPT}
                // color the Manual bar grey, Optimized accent
                shape={(props: unknown) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const p = props as any;
                  const fill = p.payload.name === "Manual" ? COLOR_MANUAL : COLOR_OPT;
                  return <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={4} fill={fill} />;
                }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}

/** Per-technician utilization, Manual vs Optimized, as grouped bars (shared %
 *  axis since utilization is the same unit for every technician). */
export function UtilizationChart({ baseline, optimized }: {
  baseline: Utilization[]; optimized: Utilization[];
}) {
  const byTech = new Map<number, { name: string; manual?: number; optimized?: number }>();
  for (const u of baseline) byTech.set(u.tech_id, { name: u.tech_name, manual: u.utilization_pct });
  for (const u of optimized) {
    const e = byTech.get(u.tech_id) ?? { name: u.tech_name };
    e.optimized = u.utilization_pct;
    byTech.set(u.tech_id, e);
  }
  const data = [...byTech.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => ({
    name: r.name.replace("Tech ", "T"),
    Manual: Math.round(r.manual ?? 0),
    Optimized: Math.round(r.optimized ?? 0),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={AXIS} stroke={GRID} unit="%" />
        <YAxis type="category" dataKey="name" tick={AXIS} stroke={GRID} width={36} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <Tooltip {...TOOLTIP} formatter={(v: any) => [`${v}%`, "Utilization"]} />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
        <Bar dataKey="Manual" fill={COLOR_MANUAL} radius={[0, 3, 3, 0]} isAnimationActive={false} />
        <Bar dataKey="Optimized" fill={COLOR_OPT} radius={[0, 3, 3, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series vertical bar chart (e.g. unassigned jobs by cause). */
export function SimpleBarChart({ data, xKey, barKey, color, yLabel, height = 220 }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[]; xKey: string; barKey: string; color: string; yLabel?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} stroke={GRID} interval={0} />
        <YAxis tick={AXIS} stroke={GRID} width={28} allowDecimals={false}
          label={yLabel ? { value: yLabel, angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 } : undefined} />
        <Tooltip {...TOOLTIP} />
        <Bar dataKey={barKey} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
