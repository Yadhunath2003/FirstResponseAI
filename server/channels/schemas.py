from pydantic import BaseModel
from typing import List, Optional

# Unit registration
class UnitRegistration(BaseModel):
    unit_type: str       # "engine", "ladder", "medic", "battalion_chief", "division", "command", "safety", "staging"
    unit_number: str     # "7", "3", "A", etc.
    device_id: str

class UnitInfo(BaseModel):
    unit_id: str
    callsign: str        # "Engine 7", "Medic 3", "Division A"
    unit_type: str
    unit_number: str
    device_id: str
    status: str = "active"

# Incident
class IncidentCreate(BaseModel):
    name: str
    incident_type: str   # "structure_fire", "mci", "hazmat", "rescue", "other"
    location_name: str
    location_lat: float
    location_lng: float

class Incident(BaseModel):
    id: str
    name: str
    incident_type: str
    location_name: str
    location_lat: float
    location_lng: float
    created_at: str
    status: str          # "active", "closed"
    unit_count: int

# Communication (voice input)
class VoiceInput(BaseModel):
    channel_id: str
    transcript: str
    unit_id: str
    incident_id: str
    # audio is sent as file in multipart form, not in this model

# WebSocket messages (server -> client)
class AudioBroadcast(BaseModel):
    type: str = "audio"
    channel_id: str
    unit_callsign: str
    audio_url: str
    transcript: str
    timestamp: str

class SummaryUpdate(BaseModel):
    type: str = "summary_update"
    summary_text: str
    timestamp: str

class ZoneSuggestion(BaseModel):
    type: str = "zone_suggestion"
    suggestion_id: str
    zone_type: str       # "danger", "warm", "cold", "blocked_road", "staging", "landing_zone"
    reason: str
    description: str

class ConflictAlert(BaseModel):
    type: str = "conflict"
    description: str
    severity: str        # "critical", "high", "medium"
    channels_involved: List[str]
    units_involved: List[str]

class UnitJoined(BaseModel):
    type: str = "unit_joined"
    unit_callsign: str
    unit_type: str

# Map zone
class MapZone(BaseModel):
    id: str
    incident_id: str
    zone_type: str
    center_lat: float
    center_lng: float
    radius_meters: float
    label: str
    created_by: str      # unit_callsign or "ai_suggestion"
    status: str          # "active", "suggested", "rejected"
