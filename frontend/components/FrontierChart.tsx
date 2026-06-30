"use client";

export interface Series {
  label: string;
  color: string;
  values: (number | null)[]; // aligned with xValues; null = no point
}

interface Props {
  xValues: number[];
  series: Series[];
  yLabel: string;
  xLabel?: string;
  height?: number;
}

// Minimal dependency-free SVG line chart for the capacity frontier.
export function FrontierChart({ xValues, series, yLabel, xLabel = "Technicians", height = 240 }: Props) {
  const W = 460, H = height;
  const padL = 40, padR = 12, padT = 14, padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xs = xValues;
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const allY = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const yMax = Math.max(1, ...allY);
  const yMin = 0;

  const xPix = (x: number) => padL + (xMax === xMin ? innerW / 2 : ((x - xMin) / (xMax - xMin)) * innerW);
  const yPix = (y: number) => padT + innerH - ((y - yMin) / (yMax - yMin)) * innerH;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((yMax / yTicks) * i));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: "visible" }}>
      {/* y grid + labels */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} y1={yPix(t)} x2={W - padR} y2={yPix(t)} stroke="var(--border)" strokeWidth={0.5} />
          <text x={padL - 6} y={yPix(t) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">{t}</text>
        </g>
      ))}
      {/* x labels */}
      {xs.map((x) => (
        <text key={x} x={xPix(x)} y={H - padB + 16} textAnchor="middle" fontSize={9} fill="var(--muted)">{x}</text>
      ))}
      <text x={padL + innerW / 2} y={H - 2} textAnchor="middle" fontSize={9} fill="var(--muted)">{xLabel}</text>
      <text x={2} y={padT + innerH / 2} fontSize={9} fill="var(--muted)"
        transform={`rotate(-90 10 ${padT + innerH / 2})`} textAnchor="middle">{yLabel}</text>

      {/* series */}
      {series.map((s) => {
        const pts = xs.map((x, i) => ({ x, v: s.values[i] })).filter((p) => p.v != null) as { x: number; v: number }[];
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xPix(p.x)} ${yPix(p.v)}`).join(" ");
        return (
          <g key={s.label}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} />
            {pts.map((p) => (
              <circle key={p.x} cx={xPix(p.x)} cy={yPix(p.v)} r={3} fill={s.color}>
                <title>{`${s.label} · ${p.x} techs: ${p.v}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function ChartLegend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
      {series.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
