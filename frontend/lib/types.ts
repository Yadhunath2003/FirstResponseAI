// Mirrors FastAPI Pydantic schemas in server/channels/schemas.py
// Keep in sync with backend.

export type UnitType =
  | "medics"
  | "fireman"
  | "police"
  | "rescue";

export type IncidentType =
  | "structure_fire"
  | "mci"
  | "hazmat"
  | "rescue"
  | "other";

export type ZoneType =
  | "danger"
  | "warm"
  | "cold"
  | "blocked_road"
  | "staging"
  | "landing_zone";

export type ChannelId = "command" | "triage" | "logistics" | "comms";

export type Priority = "routine" | "emergency" | "critical" | "high" | "medium" | "low";

export interface UnitRegistrationPayload {
  unit_type: UnitType | string;
  unit_number: string;
  device_id: string;
}

export interface UnitRegistrationResponse {
  unit_id: string;
  callsign: string;
}

export interface Unit {
  id: string;
  callsign: string;
  unit_type: string;
  unit_number: string;
  device_id: string;
  incident_id?: string | null;
  joined_at?: string | null;
  status: string;
}

export interface IncidentCreatePayload {
  name: string;
  incident_type: IncidentType | string;
  location_name: string;
  location_lat: number;
  location_lng: number;
}

export interface Incident {
  id: string;
  name: string;
  incident_type: string;
  location_name: string;
  location_lat: number;
  location_lng: number;
  created_at: string;
  status: "active" | "closed" | string;
  unit_count?: number;
}

export interface IncidentDetails extends Incident {
  units: Unit[];
  summary: string;
  initial_summary?: string | null;
  recent_comms: Communication[];
}

export interface Communication {
  id: string;
  incident_id: string;
  channel_id: string;
  unit_id: string;
  unit_callsign: string;
  transcript: string;
  audio_path?: string;
  priority?: string;
  timestamp: string;
  ai_annotations?: Record<string, unknown>;
}

export interface MapZone {
  id: string;
  incident_id: string;
  zone_type: ZoneType | string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  label: string;
  created_by: string;
  status: "active" | "suggested" | "rejected" | "deleted" | string;
  created_at?: string;
}

export interface CreateZonePayload {
  type: ZoneType | string;
  lat: number;
  lng: number;
  radius: number;
  label: string;
  created_by: string;
}

export interface Suggestion {
  id: string;
  incident_id: string;
  suggestion_type: string;
  data_json: Record<string, unknown>;
  status: "pending" | "accepted" | "rejected" | string;
  created_at: string;
}

export interface DispatchParsed {
  units_mentioned: string[];
  incident_type: string;
  address: string | null;
  description: string | null;
  notes: string | null;
  priority: string;
  location_lat: number | null;
  location_lng: number | null;
  location_display: string | null;
}

// --- Public / community feed ---

export type PublicPostKind = "awareness" | "comment" | "help" | "need";
export type PublicHelpType = "ride" | "shelter" | "supplies" | "safe" | "check" | "other";

export interface PublicIncident {
  id: string;
  name: string;
  incident_type: string;
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  status: string;
  created_at: string;
  public_summary?: string | null;
  closed_at?: string | null;
}

export interface PublicIncidentDetail extends PublicIncident {
  summary: string;
  help_counts: Record<string, number>;
}

export interface PublicPost {
  id: string;
  incident_id: string | null;
  parent_id: string | null;
  kind: PublicPostKind;
  help_type: PublicHelpType | null;
  author_name: string;
  body: string | null;
  media_url: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

// WebSocket message union (server -> client)
export type WSMessage =
  | { type: "audio"; channel_id: string; unit_callsign: string; audio_url: string; transcript: string; timestamp: string; id?: string }
  | { type: "summary_update"; summary_text: string; timestamp: string }
  | { type: "zone_suggestion"; suggestion_id: string; zone_type: string; reason: string; description: string }
  | { type: "zone_update"; zone_data: MapZone }
  | { type: "zones_refresh" }
  | { type: "conflict"; description: string; severity: string; channels_involved: string[]; units_involved: string[] }
  | { type: "unit_joined"; unit_callsign: string; unit_type: string }
  | { type: "public_post"; post: PublicPost }
  | { type: "incident_closed"; incident_id: string; public_summary: string; timestamp: string }
  | {
      type: "dispatched";
      incident_id: string;
      incident_name: string;
      incident_type: string;
      address: string;
      description: string;
      notes: string;
      priority: string;
      assigned_channel: string;
      report_to: string;
    }
  | { type: string; [key: string]: unknown };
