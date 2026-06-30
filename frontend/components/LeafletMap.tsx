"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { Route } from "@/lib/api";
import { priorityColor } from "@/lib/format";

interface Props {
  technicians: { home_x: number; home_y: number; name: string }[];
  jobs?: { x: number; y: number; priority: number }[];
  routes?: Route[];
}

const ROUTE_HUES = [180, 150, 95, 45, 20, 320, 265, 210, 120, 0, 60, 290];

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

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ro: any;
    import("leaflet").then(({ default: L }) => {
      if (!active || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);
      map.setView([32.85, -96.75], 11);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      LRef.current = L;
      ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(elRef.current);
      setTimeout(() => active && map.invalidateSize(), 120);
      setReady(true);
    });
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

    jobs?.forEach((j) => {
      L.circleMarker([j.y, j.x], {
        radius: 4, color: priorityColor(j.priority), weight: 1,
        fillColor: priorityColor(j.priority), fillOpacity: 0.65,
      }).addTo(layer);
      bounds.push([j.y, j.x]);
    });

    routes?.forEach((rt, i) => {
      const color = `hsl(${ROUTE_HUES[i % ROUTE_HUES.length]} 80% 60%)`;
      const pts: [number, number][] = [
        [rt.home_y, rt.home_x],
        ...rt.stops.map((s) => [s.y, s.x] as [number, number]),
        [rt.home_y, rt.home_x],
      ];
      L.polyline(pts, { color, weight: 2, opacity: 0.85 }).addTo(layer);
      rt.stops.forEach((s) => {
        L.circleMarker([s.y, s.x], {
          radius: 4, color, weight: 1, fillColor: color, fillOpacity: 0.95,
        })
          .addTo(layer)
          .bindTooltip(`#${s.job_id} · ${s.required_skill} · stop ${s.seq + 1}`);
        bounds.push([s.y, s.x]);
      });
      bounds.push([rt.home_y, rt.home_x]);
    });

    technicians.forEach((t) => {
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:11px;height:11px;background:var(--accent);transform:rotate(45deg);border:1px solid #06121f;box-shadow:0 0 4px rgba(0,0,0,.5)"></div>',
        iconSize: [11, 11],
        iconAnchor: [6, 6],
      });
      L.marker([t.home_y, t.home_x], { icon }).addTo(layer).bindTooltip(t.name);
      bounds.push([t.home_y, t.home_x]);
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }, [ready, technicians, jobs, routes]);

  return <div ref={elRef} className="w-full h-full rounded-md overflow-hidden" style={{ background: "var(--panel-2)" }} />;
}
