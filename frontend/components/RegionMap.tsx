"use client";

import { Route, Technician } from "@/lib/api";
import { priorityColor } from "@/lib/format";

interface Props {
  technicians: Pick<Technician, "home_x" | "home_y" | "name">[];
  jobs?: { x: number; y: number; priority: number }[];
  routes?: Route[];
  region?: number;
}

const ROUTE_HUES = [180, 150, 95, 45, 20, 320, 265, 210, 120, 0, 60, 290];

// Grid is plotted with y flipped so larger y reads as "north".
const fy = (y: number, region: number) => region - y;

export function RegionMap({ technicians, jobs, routes, region = 100 }: Props) {
  return (
    <svg viewBox={`-6 -6 ${region + 12} ${region + 12}`} className="w-full h-full">
      {/* grid */}
      {Array.from({ length: 11 }).map((_, i) => (
        <g key={i} stroke="var(--border)" strokeWidth={0.2}>
          <line x1={i * region / 10} y1={0} x2={i * region / 10} y2={region} />
          <line x1={0} y1={i * region / 10} x2={region} y2={i * region / 10} />
        </g>
      ))}

      {/* jobs */}
      {jobs?.map((j, i) => (
        <circle key={`j${i}`} cx={j.x} cy={fy(j.y, region)} r={1.1}
          fill={priorityColor(j.priority)} opacity={0.7} />
      ))}

      {/* routes */}
      {routes?.map((rt, i) => {
        const hue = ROUTE_HUES[i % ROUTE_HUES.length];
        const stroke = `hsl(${hue} 80% 60%)`;
        const pts = [
          [rt.home_x, rt.home_y],
          ...rt.stops.map((s) => [s.x, s.y]),
          [rt.home_x, rt.home_y],
        ];
        const d = pts.map(([x, y], k) => `${k === 0 ? "M" : "L"} ${x} ${fy(y, region)}`).join(" ");
        return (
          <g key={`r${i}`}>
            <path d={d} fill="none" stroke={stroke} strokeWidth={0.6} opacity={0.85} />
            {rt.stops.map((s, k) => (
              <circle key={k} cx={s.x} cy={fy(s.y, region)} r={1.2}
                fill={stroke} stroke="#06121f" strokeWidth={0.3} />
            ))}
          </g>
        );
      })}

      {/* technician home bases */}
      {technicians.map((t, i) => (
        <g key={`t${i}`}>
          <rect x={t.home_x - 1.6} y={fy(t.home_y, region) - 1.6} width={3.2} height={3.2}
            transform={`rotate(45 ${t.home_x} ${fy(t.home_y, region)})`}
            fill="var(--accent)" stroke="#06121f" strokeWidth={0.3} />
        </g>
      ))}
    </svg>
  );
}
