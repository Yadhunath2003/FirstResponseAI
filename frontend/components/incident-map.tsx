"use client";

// Next.js wrapper that lazy-loads Leaflet only on the client.
// Leaflet imports `window` at module load and breaks SSR otherwise.

import dynamic from "next/dynamic";
import type { LeafletMapProps } from "./leaflet-map";

const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function IncidentMap(props: LeafletMapProps) {
  return <LeafletMap {...props} />;
}
