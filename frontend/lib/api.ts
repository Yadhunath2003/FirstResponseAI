// Thin REST client for the FastAPI backend. All methods are async and
// throw ApiError on non-2xx responses.

import { API_URL } from "./env";
import type {
  Communication,
  CreateZonePayload,
  DispatchParsed,
  Incident,
  IncidentCreatePayload,
  IncidentDetails,
  MapZone,
  Suggestion,
  UnitRegistrationPayload,
  UnitRegistrationResponse,
} from "./types";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  let body = init?.body;

  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, body });

  if (!res.ok) {
    let errBody: unknown = undefined;
    try {
      errBody = await res.json();
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, `API ${res.status} on ${path}`, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // --- Registration ---
  registerUnit: (payload: UnitRegistrationPayload) =>
    request<UnitRegistrationResponse>("/api/register", {
      method: "POST",
      json: payload,
    }),

  // --- Incidents ---
  listIncidents: () => request<Incident[]>("/api/incidents"),

  createIncident: (payload: IncidentCreatePayload) =>
    request<Incident>("/api/incidents", { method: "POST", json: payload }),

  getIncident: (incidentId: string) =>
    request<IncidentDetails>(`/api/incidents/${incidentId}`),

  joinIncident: (incidentId: string, unitId: string) =>
    request<{ status: string }>(`/api/incidents/${incidentId}/join`, {
      method: "POST",
      json: { unit_id: unitId },
    }),

  // --- Dispatch ---
  parseDispatch: (transcript: string) =>
    request<DispatchParsed>("/api/dispatch/parse", {
      method: "POST",
      json: { transcript },
    }),

  confirmDispatch: (parsed: DispatchParsed) =>
    request<Incident>("/api/dispatch/confirm", {
      method: "POST",
      json: { parsed },
    }),

  // --- Channels ---
  getChannels: (incidentId: string) =>
    request<{ id: string; name: string }[]>(
      `/api/incidents/${incidentId}/channels`,
    ),

  // --- Voice (multipart) ---
  postVoice: async (params: {
    channelId: string;
    transcript: string;
    unitId: string;
    incidentId: string;
    audioBlob?: Blob;
    audioFilename?: string;
  }) => {
    const fd = new FormData();
    fd.append("channel_id", params.channelId);
    fd.append("transcript", params.transcript);
    fd.append("unit_id", params.unitId);
    fd.append("incident_id", params.incidentId);
    if (params.audioBlob) {
      fd.append(
        "audio_blob",
        params.audioBlob,
        params.audioFilename ?? "clip.webm",
      );
    }
    const res = await fetch(`${API_URL}/api/voice`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      throw new ApiError(res.status, `POST /api/voice failed`);
    }
    return (await res.json()) as { status: string; comm_id: string };
  },

  // --- Zones ---
  getZones: (incidentId: string) =>
    request<MapZone[]>(`/api/incidents/${incidentId}/zones`),

  createZone: (incidentId: string, payload: CreateZonePayload) =>
    request<MapZone>(`/api/incidents/${incidentId}/zones`, {
      method: "POST",
      json: payload,
    }),

  deleteZone: (incidentId: string, zoneId: string) =>
    request<{ status: string }>(
      `/api/incidents/${incidentId}/zones/${zoneId}`,
      { method: "DELETE" },
    ),

  // --- AI outputs ---
  getSummary: (incidentId: string) =>
    request<{ summary_text: string }>(
      `/api/incidents/${incidentId}/summary`,
    ),

  getSuggestions: (incidentId: string) =>
    request<Suggestion[]>(`/api/incidents/${incidentId}/suggestions`),

  resolveSuggestion: (
    incidentId: string,
    suggestionId: string,
    action: "accept" | "reject",
    payload: { resolved_by: string; lat?: number; lng?: number; radius?: number },
  ) =>
    request<{ status: string }>(
      `/api/incidents/${incidentId}/suggestions/${suggestionId}/${action}`,
      { method: "POST", json: payload },
    ),

  // --- LiveKit (voice transport) ---
  getLivekitToken: (params: {
    incidentId: string;
    channelId: string;
    unitId: string;
    callsign: string;
    canPublish?: boolean;
    canSubscribe?: boolean;
  }) =>
    request<{ url: string; token: string; room: string }>(
      "/api/livekit/token",
      {
        method: "POST",
        json: {
          incident_id: params.incidentId,
          channel_id: params.channelId,
          unit_id: params.unitId,
          callsign: params.callsign,
          can_publish: params.canPublish ?? true,
          can_subscribe: params.canSubscribe ?? true,
        },
      },
    ),

  // --- Timeline / search ---
  getTimeline: (incidentId: string) =>
    request<Communication[]>(`/api/incidents/${incidentId}/timeline`),

  searchHistory: (incidentId: string, query: string) =>
    request<Communication[]>(`/api/incidents/${incidentId}/search`, {
      method: "POST",
      json: { query },
    }),
};

// Static asset URL helper for audio playback.
export function audioUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_URL}/audio/${path.replace(/^\//, "")}`;
}
