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
// Distinct from the teal job-clusters and the red/amber/blue/grey job dots.
const TECH_COLOR = "#8b5cf6";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function row(label: string, value: string) {
  return `<div class="row"><span>${label}</span><b>${value}</b></div>`;
}

function jobPopup(j: MapJob): string {
  const part = j.requires_part ? (j.part_available ? "in stock" : "missing") : "-";
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${priorityColor(j.priority)}"></span>
      Job #${esc(j.id)} ${j.is_emergency ? '<span class="badge-em">EMERGENCY</span>' : ""}
    </div>
    ${row("Status", '<span style="color:var(--text-faint)">Unassigned</span>')}
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
    ? `${hhmm(t.shift_start)}-${hhmm(t.shift_end)}` : "-";
  // No route attached => board/input view: this marker is just the crew's
  // home base, nothing is assigned yet. Make that explicit so the diamond
  // sitting amid a job cluster doesn't read as "this tech owns these calls".
  const onBoard = stops == null;
  return `<div class="map-pop">
    <div class="map-pop-h">
      <span class="dot" style="background:${TECH_COLOR}"></span> ${esc(t.name)}${onBoard ? " · Home base" : ""}
    </div>
    ${t.skills?.length ? row("Skills", esc(t.skills.join(", "))) : ""}
    ${row("Shift", shift)}
    ${stops != null ? row("Jobs on route", String(stops)) : ""}
    ${stops != null ? '<div class="map-pop-hint">click route to isolate</div>' : ""}
    ${onBoard ? '<div class="map-pop-hint">Daily start/end location — not assigned work. Run the optimizer to assign jobs.</div>' : ""}
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
    ${row("Window", `${hhmm(s.start)}-${hhmm(s.end)}`)}
  </div>`;
}

// Coordinates are [lon=x, lat=y]; Leaflet wants [lat, lon].
export default function LeafletMap({ technicians, jobs, routes }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const routesPanelRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [routesOpen, setRoutesOpen] = useState(true);

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

      // Dedicated high-z pane so technician bases always sit above job markers
      // and clusters (their home bases share coordinates with job sites, so
      // otherwise they get covered, especially when zoomed in).
      // Above job markers (markerPane 600) and clusters, but below Leaflet's
      // tooltipPane (650) and popupPane (700) so popups/tooltips never hide
      // behind a technician diamond.
      const techPane = map.createPane("techPane");
      techPane.style.zIndex = "620";
      // Route stop markers sit just above the tech bases (but below tooltips/
      // popups) so a numbered stop is never hidden under a home-base diamond
      // it shares coordinates with.
      const stopPane = map.createPane("stopPane");
      stopPane.style.zIndex = "630";

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
        spiderfyDistanceMultiplier: 1.6,
        spiderLegPolylineOptions: { weight: 1, color: "var(--text-faint)", opacity: 0.35 },
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
        // Several jobs can sit at the same site (up to 8 in this dataset), so
        // multiple stops share one coordinate. Fan co-located stops around the
        // point via icon anchor so each numbered marker stays visible and
        // clickable; the anchor keeps them tied to the true location.
        const coLocTotal = new Map<string, number>();
        rt.stops.forEach((s) => {
          const k = `${s.x},${s.y}`;
          coLocTotal.set(k, (coLocTotal.get(k) ?? 0) + 1);
        });
        const coLocSeen = new Map<string, number>();
        rt.stops.forEach((s) => {
          const k = `${s.x},${s.y}`;
          const total = coLocTotal.get(k) ?? 1;
          const idx = coLocSeen.get(k) ?? 0;
          coLocSeen.set(k, idx + 1);
          let anchor: [number, number] = [10, 10];
          if (total > 1) {
            const ang = (2 * Math.PI * idx) / total - Math.PI / 2;
            const r = 11;
            anchor = [10 - r * Math.cos(ang), 10 - r * Math.sin(ang)];
          }
          const icon = L.divIcon({
            className: "route-stop-wrap",
            html: `<div class="route-stop" style="background:${color}">${s.seq + 1}</div>`,
            iconSize: [20, 20], iconAnchor: anchor,
          });
          const m = L.marker([s.y, s.x], { icon, pane: "stopPane" }).addTo(layer);
          m.bindTooltip(`#${s.job_id} · stop ${s.seq + 1}`, { direction: "top" });
          m.bindPopup(stopPopup(s, rt.tech_name, color));
        });
        if (isSel || selected === null) pts.forEach((p) => bounds.push(p));
      }
    });

    // --- technician home bases (always shown) ---
    const stopsByTech = new Map<string, number>();
    routes?.forEach((rt) => stopsByTech.set(rt.tech_name, rt.stops.length));
    // When a route is isolated, fade the other crews' home bases so the
    // selected route's stops read clearly instead of competing with a dozen
    // diamonds.
    const selectedTechName = selected != null
      ? routes?.find((rt) => rt.tech_id === selected)?.tech_name ?? null
      : null;
    technicians.forEach((t) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;background:${TECH_COLOR};transform:rotate(45deg);border:2px solid #fff;box-shadow:0 0 5px rgba(0,0,0,.55)"></div>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      });
      const m = L.marker([t.home_y, t.home_x], { icon, pane: "techPane", riseOnHover: true }).addTo(layer);
      if (selectedTechName != null && t.name !== selectedTechName) m.setOpacity(0.25);
      m.bindTooltip(`${t.name}${hasRoutes ? "" : " · home base"}`, { direction: "top" });
      m.bindPopup(techPopup(t, stopsByTech.get(t.name)));
      if (!hasRoutes || selected === null) bounds.push([t.home_y, t.home_x]);
    });

    // Auto-fit must not frame stops underneath the HTML overlays. Measure the
    // actual overlay rects so we reserve exactly the space they occupy: the
    // Routes legend (top-right) reserves the right edge, the priority legend
    // (bottom-left, plus the bottom-right layers control) reserves the bottom.
    // Clamped to 45% per axis so a tight route never collapses to a sliver.
    if (bounds.length) {
      const cont = elRef.current?.getBoundingClientRect();
      const padTop = 24, padLeft = 24;
      let padRight = 24, padBottom = 56;
      if (cont) {
        const rp = routesPanelRef.current?.getBoundingClientRect();
        if (rp) padRight = Math.min(cont.width * 0.45, Math.max(padRight, cont.right - rp.left + 12));
        const lg = legendRef.current?.getBoundingClientRect();
        if (lg) padBottom = Math.min(cont.height * 0.45, Math.max(padBottom, cont.bottom - lg.top + 12));
      }
      map.fitBounds(bounds, {
        paddingTopLeft: [padLeft, padTop],
        paddingBottomRight: [padRight, padBottom],
        maxZoom: 14,
      });
    }
  }, [ready, technicians, jobs, routes, selected]);

  return (
    <div className="relative w-full h-full">
      <div ref={elRef} className="absolute inset-0 rounded-md overflow-hidden"
        style={{ background: "var(--panel-2)" }} />

      {/* Interactive route legend: click a tech to isolate its route. Mirrors
          clicking the polyline, but discoverable and precise where the lines
          overlap. Selection is shared state, so map and legend stay in sync. */}
      {!!routes?.length && (
        <div ref={routesPanelRef} className="absolute z-[600] right-2 top-2 w-44 rounded-md text-[11px]"
          style={{ background: "color-mix(in srgb, var(--surface-1) 92%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(4px)" }}>
          <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-1">
            <button onClick={() => setRoutesOpen((o) => !o)} className="flex items-center gap-1 font-medium"
              style={{ color: "var(--text-muted)" }} title={routesOpen ? "Collapse" : "Expand"}>
              <span style={{ display: "inline-block", transition: "transform .15s ease", transform: routesOpen ? "rotate(90deg)" : "none" }}>▸</span>
              Routes
              <span className="mono" style={{ color: "var(--text-faint)" }}>({routes.length})</span>
            </button>
            {selected !== null && (
              <button onClick={() => setSelected(null)} className="font-medium" style={{ color: "var(--accent)" }}>
                Show all
              </button>
            )}
          </div>
          {routesOpen && (
          <div className="max-h-[190px] overflow-auto px-1 pb-1 space-y-0.5">
            {routes.map((rt, i) => {
              const color = `hsl(${ROUTE_HUES[i % ROUTE_HUES.length]} 80% 60%)`;
              const isSel = selected === rt.tech_id;
              const dim = selected !== null && !isSel;
              return (
                <button key={rt.tech_id}
                  onClick={() => setSelected((p) => (p === rt.tech_id ? null : rt.tech_id))}
                  title={`${rt.tech_name} · ${rt.stops.length} stop${rt.stops.length === 1 ? "" : "s"}`}
                  className="flex items-center gap-1.5 w-full text-left rounded px-1.5 py-0.5"
                  style={{ background: isSel ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "transparent", opacity: dim ? 0.55 : 1 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block", flex: "0 0 auto" }} />
                  <span className="truncate" style={{ color: "var(--text-muted)" }}>{rt.tech_name}</span>
                  <span className="ml-auto mono" style={{ color: "var(--text-faint)" }}>{rt.stops.length}</span>
                </button>
              );
            })}
          </div>
          )}
        </div>
      )}

      <div ref={legendRef} className="absolute z-[500] left-2 bottom-2 rounded-md px-2.5 py-2 text-[11px] space-y-1"
        style={{ background: "color-mix(in srgb, var(--surface-1) 90%, transparent)", border: "1px solid var(--border)", color: "var(--text-muted)", backdropFilter: "blur(4px)" }}>
        <LegendRow color="#f43f5e" label="P1 critical" />
        <LegendRow color="#f59e0b" label="P2 high" />
        <LegendRow color="#38bdf8" label="P3 normal" />
        <LegendRow color="#94a3b8" label="P4 low" />
        <div style={{ borderTop: "1px solid var(--border)", margin: "3px 0" }} />
        <div className="flex items-center gap-1.5">
          <span style={{ width: 10, height: 10, background: TECH_COLOR, transform: "rotate(45deg)", display: "inline-block", border: "1px solid #fff" }} />
          tech home base
        </div>
        {routes?.length ? (
          <div className="pt-1" style={{ color: "var(--accent)" }}>click a route or list row to isolate</div>
        ) : (
          <div className="pt-1" style={{ color: "var(--text-faint)" }}>backlog by site location · optimize to assign</div>
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
