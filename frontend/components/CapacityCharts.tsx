"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { fill: "var(--muted)", fontSize: 11 };
const GRID = "var(--border)";
const TOOLTIP = {
  contentStyle: {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--foreground)",
    fontSize: 12,
  },
  labelStyle: { color: "var(--muted)" },
  itemStyle: { color: "var(--foreground)" },
  cursor: { stroke: "var(--border)" },
};

export interface LineDef { key: string; name: string; color: string; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ThemedLineChart({ data, xKey, lines, yLabel, xLabel = "Technicians", height = 260 }: {
  data: any[]; xKey: string; lines: LineDef[]; yLabel: string; xLabel?: string; height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 24, right: 16, bottom: 16, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} stroke={GRID}
          label={{ value: xLabel, position: "insideBottom", offset: -6, fill: "var(--muted)", fontSize: 11 }} />
        <YAxis tick={AXIS} stroke={GRID} width={40}
          label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
        <Tooltip {...TOOLTIP} />
        <Legend verticalAlign="top" align="right" height={24} wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name}
            stroke={l.color} strokeWidth={2.5} dot={{ r: 3, fill: l.color }}
            activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function MarginalBarChart({ data, height = 240 }: { data: any[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 18, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} stroke={GRID}
          label={{ value: "Crew size after hire", position: "insideBottom", offset: -8, fill: "var(--muted)", fontSize: 11 }} />
        <YAxis tick={AXIS} stroke={GRID} width={40}
          label={{ value: "Jobs gained", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11 }} />
        <Tooltip {...TOOLTIP}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, _n: any, p: any) => [`+${v} jobs · ${p.payload.deltaOvertime >= 0 ? "+" : ""}${p.payload.deltaOvertime}h OT`, "Marginal"]} />
        <Bar dataKey="deltaJobs" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.deltaJobs > 0 ? "var(--good)" : "var(--muted)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
