"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it must load client-only (ssr: false), which is
// only allowed inside a Client Component - hence this thin wrapper.
const MapView = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full grid place-items-center rounded-md"
      style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
      loading map…
    </div>
  ),
});

export default MapView;
