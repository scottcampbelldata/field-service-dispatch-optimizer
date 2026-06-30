"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Route } from "@/lib/api";
import { PRIORITY_LABEL, hhmm, priorityColor } from "@/lib/format";

interface MapTech {
  home_x: number; home_y: number; name: string;
  skills?: string[]; shift_start?: number; shift_end?: number;
}
interface MapJob {
  id?: number; x: number; y: number; priority: number;
  site_name?: string; required_skill?: string; sla_deadline?: number;
  duration?: number; requires_part?: boolean; part_available?: boolean; is_emergency?: boolean;
}
interface Props {
  technicians: MapTech[];
  jobs?: MapJob[];
  routes?: Route[];
}

const ROUTE_HUES = [180, 150, 95, 45, 20, 320, 265, 210, 120, 0, 60, 290];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function row(label: string, value: string) {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

function jobPopup(j: MapJob): string {
  const part = j.requires_part ? (j.part_available ? "in stock" : "missing") : "—";
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${priorityColor(j.priority)}"></span>
      Job #${esc(j.id)} ${j.is_emergency ? '<span class="badge-em">EMERGENCY</span>' : ""}
    </div>
    ${row("Site", esc(j.site_name))}
    ${row("Skill", esc(j.required_skill))}
    ${row("Priority", esc(PRIORITY_LABEL[j.priority] ?? j.priority))}
    ${row("SLA deadline", hhmm(j.sla_deadline))}
    ${row("Duration", `${esc(j.duration)}m`)}
    ${row("Part", part)}
  </div>`;
}

function techPopup(t: MapTech, stops?: number): string {
  const shift = t.shift_start != null && t.shift_end != null
    ? `${hhmm(t.shift_start)}–${hhmm(t.shift_end)}` : "—";
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:var(--accent)"></span> ${esc(t.name)}
    </div>
    ${t.skills?.length ? row("Skills", esc(t.skills.join(", "))) : ""}
    ${row("Shift", shift)}
    ${stops != null ? row("Jobs on route", String(stops)) : ""}
    ${stops != null ? '<div class="map-pop-hint">click route to isolate</div>' : ""}
  </div>`;
}

function stopPopup(s: Route["stops"][number], techName: string, color: string): string {
  const flags = [
    s.is_sla_breach ? '<span class="badge-em">SLA BREACH</span>' : "",
    s.is_overtime ? '<span class="badge-em" style="background:var(--warn)">OT</span>' : "",
  ].join(" ");
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${color}"></span> Stop ${s.seq + 1} · Job #${esc(s.job_id)} ${flags}
    </div>
    ${row("Technician", esc(techName))}
    ${row("Skill", esc(s.required_skill))}
    ${row("Site", esc(s.site_name))}
    ${row("Window", `${hhmm(s.start)}–${hhmm(s.end)}`)}
  </div>`;
}

// Coordinates are [lon=x, lat=y]; Leaflet wants [lat, lon].
export default function LeafletMap({ technicians, jobs, routes }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ro: any;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (!active || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true });

      // Free, no-key basemaps. Colorful "Streets" is the default; a switcher
      // lets you flip to Satellite or the original Dark theme.
      const streets = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19 },
      );
      const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri", maxZoom: 19 },
      );
      const labels = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
        { attribution: "", subdomains: "abcd", maxZoom: 19, pane: "shadowPane" },
      );
      const dark = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19 },
      );
      // Default basemap follows the app theme (Dark tiles in dark mode).
      const isDark = document.documentElement.classList.contains("dark");
      (isDark ? dark : streets).addTo(map);
      // Pair street labels with satellite imagery so roads stay readable.
      const satelliteHybrid = L.layerGroup([satellite, labels]);
      L.control.layers(
        { Streets: streets, Satellite: satelliteHybrid, Dark: dark },
        {},
        { position: "bottomright", collapsed: true },
      ).addTo(map);

      map.setView([32.85, -96.75], 11);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      LRef.current = L;
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(elRef.current);
      setTimeout(() => active && map.invalidateSize(), 120);
      setReady(true);
    })();
    return () => {
      active = false;
      if (ro) ro.disconnect();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    const bounds: [number, number][] = [];
    const hasRoutes = !!routes?.length;

    // --- standalone jobs (board): clustered ---
    if (jobs?.length && !hasRoutes) {
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iconCreateFunction: (c: any) => L.divIcon({
          className: "",
          html: `<div class="cluster">${c.getChildCount()}</div>`,
          iconSize: [34, 34],
        }),
      });
      jobs.forEach((j) => {
        const r = j.priority === 1 ? 6 : j.priority === 2 ? 5 : 4;
        const color = priorityColor(j.priority);
        const m = L.circleMarker([j.y, j.x], {
          radius: r, color: j.is_emergency ? "#ffffff" : color,
          weight: j.is_emergency ? 2 : 1, fillColor: color, fillOpacity: 0.8,
        });
        m.bindTooltip(`#${j.id ?? ""} · ${j.required_skill ?? ""}`, { direction: "top" });
        m.bindPopup(jobPopup(j));
        m.on("mouseover", () => m.setRadius(r + 3));
        m.on("mouseout", () => m.setRadius(r));
        cluster.addLayer(m);
        bounds.push([j.y, j.x]);
      });
      layer.addLayer(cluster);
    }

    // --- routes: polylines + numbered stops, with click-to-isolate ---
    routes?.forEach((rt, i) => {
      const color = `hsl(${ROUTE_HUES[i % ROUTE_HUES.length]} 80% 60%)`;
      const isSel = selected === rt.tech_id;
      const dim = selected !== null && !isSel;

      const pts: [number, number][] = [
        [rt.home_y, rt.home_x],
        ...rt.stops.map((s) => [s.y, s.x] as [number, number]),
        [rt.home_y, rt.home_x],
      ];
      const line = L.polyline(pts, {
        color, weight: isSel ? 4 : 2, opacity: dim ? 0.1 : 0.85,
      }).addTo(layer);
      line.on("click", () => setSelected((p) => (p === rt.tech_id ? null : rt.tech_id)));

      if (!dim) {
        rt.stops.forEach((s) => {
          const icon = L.divIcon({
            className: "route-stop-wrap",
            html: `<div class="route-stop" style="background:${color}">${s.seq + 1}</div>`,
            iconSize: [20, 20], iconAnchor: [10, 10],
          });
          const m = L.marker([s.y, s.x], { icon }).addTo(layer);
          m.bindTooltip(`#${s.job_id} · stop ${s.seq + 1}`, { direction: "top" });
          m.bindPopup(stopPopup(s, rt.tech_name, color));
        });
        if (isSel || selected === null) pts.forEach((p) => bounds.push(p));
      }
    });

    // --- technician home bases (always shown) ---
    const stopsByTech = new Map<string, number>();
    routes?.forEach((rt) => stopsByTech.set(rt.tech_name, rt.stops.length));
    technicians.forEach((t) => {
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:12px;height:12px;background:var(--accent);transform:rotate(45deg);border:1px solid #06121f;box-shadow:0 0 5px rgba(0,0,0,.6)"></div>',
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      const m = L.marker([t.home_y, t.home_x], { icon }).addTo(layer);
      m.bindTooltip(t.name, { direction: "top" });
      m.bindPopup(techPopup(t, stopsByTech.get(t.name)));
      if (!hasRoutes || selected === null) bounds.push([t.home_y, t.home_x]);
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
  }, [ready, technicians, jobs, routes, selected]);

  const showClear = selected !== null && !!routes?.length;

  return (
    <div className="relative w-full h-full">
      <div ref={elRef} className="absolute inset-0 rounded-md overflow-hidden"
        style={{ background: "var(--panel-2)" }} />

      {showClear && (
        <button onClick={() => setSelected(null)}
          className="absolute z-[600] right-2 top-2 rounded-md px-2.5 py-1 text-xs font-medium"
          style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}>
          Show all routes
        </button>
      )}

      <div className="absolute z-[500] left-2 bottom-2 rounded-md px-2.5 py-2 text-[11px] space-y-1"
        style={{ background: "rgba(13,20,34,0.85)", border: "1px solid var(--border)", color: "var(--muted)" }}>
        <LegendRow color="#f43f5e" label="P1 critical" />
        <LegendRow color="#f59e0b" label="P2 high" />
        <LegendRow color="#38bdf8" label="P3 normal" />
        <LegendRow color="#94a3b8" label="P4 low" />
        <div className="flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, background: "var(--accent)", transform: "rotate(45deg)", display: "inline-block" }} />
          tech base
        </div>
        {!!routes?.length && (
          <div className="pt-1" style={{ color: "var(--accent)" }}>click a route to isolate</div>
        )}
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ width: 9, height: 9, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}
