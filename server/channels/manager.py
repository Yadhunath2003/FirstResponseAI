from datetime import datetime, timezone
import uuid

from server.channels.schemas import VoiceInput
from server.ai.pipeline import trigger_ai_pipeline
from server.storage.database import store_communication, get_unit
from server.config import MAX_CHANNEL_HISTORY

DEFAULT_CHANNELS = {
    "command": {"name": "Command", "color": "#e74c3c"},
    "triage": {"name": "Triage", "color": "#f39c12"},
    "logistics": {"name": "Logistics", "color": "#2ecc71"},
    "comms": {"name": "Comms", "color": "#3498db"},
}

class ChannelManager:
    def __init__(self):
        self.channels = DEFAULT_CHANNELS.copy()

    def get_channel(self, channel_id: str) -> dict | None:
        return self.channels.get(channel_id)

    def get_all_channels(self) -> list[dict]:
        return [
            {
                "id": cid,
                "name": meta["name"],
                "color": meta["color"],
                "last_message": None  # Handled by UI or DB
            }
            for cid, meta in self.channels.items()
        ]

    async def process_communication(
        self, channel_id: str, unit_id: str, incident_id: str, transcript: str, audio_path: str
    ) -> dict | None:
        channel = self.get_channel(channel_id)
        if not channel:
            return None

        # Resolve unit to get callsign
        unit_info = get_unit(unit_id)
        if not unit_info:
            return None
            
        callsign = unit_info.get("callsign", "Unknown Unit")

        # 1. Store in DB
        comm_id, timestamp = store_communication(
            incident_id=incident_id,
            channel_id=channel_id,
            unit_id=unit_id,
            unit_callsign=callsign,
            transcript=transcript,
            audio_path=audio_path
        )
        
        # Audio URL logic moved to main.py or returned directly
        audio_url = f"/audio/{audio_path}" if audio_path else ""
        
        new_comm_dict = {
            "id": comm_id,
            "incident_id": incident_id,
            "channel_id": channel_id,
            "unit_id": unit_id,
            "unit_callsign": callsign,
            "transcript": transcript,
            "audio_path": audio_path,
            "timestamp": timestamp
        }

        # 3. Queue AI Processing (Async, Fire-and-Forget)
        trigger_ai_pipeline(incident_id, new_comm_dict)

        # 2. Return payload that will be broadcast via WebSocket
        return {
            "type": "audio",
            "channel_id": channel_id,
            "unit_callsign": callsign,
            "audio_url": audio_url,
            "transcript": transcript,
            "timestamp": timestamp
        }
