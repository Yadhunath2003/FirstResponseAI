"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { MapZone } from "@/lib/types";

// Fix default marker icons — Leaflet's default asset paths break under bundlers.
// Using a CDN avoids shipping PNGs with the app.
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const ZONE_COLORS: Record<string, string> = {
  danger: "#e74c3c",
  hot: "#e74c3c",
  evacuation: "#e74c3c",
  warm: "#f39c12",
  cold: "#2ecc71",
  safe: "#2ecc71",
  staging: "#9b59b6",
  staging_area: "#9b59b6",
  landing_zone: "#3498db",
  landing: "#3498db",
  blocked_road: "#e67e22",
};

function FitBounds({ zones, center }: { zones: MapZone[]; center: LatLngExpression }) {
  const map = useMap();
  useEffect(() => {
    if (zones.length === 0) return;
    const bounds = L.latLngBounds(
      zones.map((z) => L.latLng(z.center_lat, z.center_lng)),
    );
    bounds.extend(center as L.LatLngTuple);
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
  }, [zones, center, map]);
  return null;
}

export interface LeafletMapProps {
  center: [number, number];
  zones?: MapZone[];
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  interactive?: boolean;
}

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onMapClick]);
  return null;
}

export default function LeafletMap({
  center,
  zones = [],
  onMapClick,
  className,
  interactive = true,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={16}
      scrollWheelZoom={interactive}
      dragging={interactive}
      className={className ?? "h-full w-full rounded-md"}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        maxZoom={19}
      />
      <Marker position={center}>
        <Popup>Incident location</Popup>
      </Marker>
      {zones.map((z) => {
        const color = ZONE_COLORS[z.zone_type] ?? "#3498db";
        const radius = Math.min(Math.max(z.radius_meters || 500, 100), 50000);
        return (
          <Circle
            key={z.id}
            center={[z.center_lat, z.center_lng]}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.2, weight: 2 }}
          >
            <Popup>
              <strong>{z.label || z.zone_type}</strong>
              <br />
              Type: {z.zone_type}
              <br />
              Radius: {(radius / 1000).toFixed(1)} km
            </Popup>
          </Circle>
        );
      })}
      <FitBounds zones={zones} center={center} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
    </MapContainer>
  );
}
