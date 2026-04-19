"use client";

import dynamic from "next/dynamic";
import type { PublicLeafletMapProps } from "./public-leaflet-map";

const PublicLeafletMap = dynamic(() => import("./public-leaflet-map"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">
      Loading map…
    </div>
  ),
});

export function PublicMap(props: PublicLeafletMapProps) {
  return <PublicLeafletMap {...props} />;
}
