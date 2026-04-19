"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { PublicIncident } from "@/lib/types";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function FitToMarkers({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [points, map]);
  return null;
}

export interface PublicLeafletMapProps {
  incidents: PublicIncident[];
  onSelect: (incidentId: string) => void;
  className?: string;
}

export default function PublicLeafletMap({
  incidents,
  onSelect,
  className,
}: PublicLeafletMapProps) {
  const pinned = incidents.filter(
    (i) => typeof i.location_lat === "number" && typeof i.location_lng === "number",
  );
  const points: Array<[number, number]> = pinned.map((i) => [
    i.location_lat as number,
    i.location_lng as number,
  ]);
  const center: [number, number] = points[0] ?? [38.9592, -95.2453];

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className={className ?? "h-full w-full rounded-md"}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap &copy; CARTO"
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
      {pinned.map((inc) => (
        <Marker
          key={inc.id}
          position={[inc.location_lat as number, inc.location_lng as number]}
          eventHandlers={{ click: () => onSelect(inc.id) }}
        >
          <Popup>
            <div className="space-y-1">
              <strong>{inc.name}</strong>
              <div className="text-xs opacity-70">{inc.location_name || inc.incident_type}</div>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => onSelect(inc.id)}
              >
                Open thread →
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
      <FitToMarkers points={points} />
    </MapContainer>
  );
}
