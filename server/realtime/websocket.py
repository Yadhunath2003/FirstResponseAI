import json
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # dict mapping incident_id -> dict(unit_id -> WebSocket)
        self.active_connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, incident_id: str, unit_id: str, websocket: WebSocket):
        await websocket.accept()
        if incident_id not in self.active_connections:
            self.active_connections[incident_id] = {}
        self.active_connections[incident_id][unit_id] = websocket

    def disconnect(self, incident_id: str, unit_id: str):
        if incident_id in self.active_connections:
            self.active_connections[incident_id].pop(unit_id, None)
            if not self.active_connections[incident_id]:
                del self.active_connections[incident_id]

    async def send_to_unit(self, incident_id: str, unit_id: str, message: dict):
        if incident_id in self.active_connections:
            ws = self.active_connections[incident_id].get(unit_id)
            if ws:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    self.disconnect(incident_id, unit_id)

    async def broadcast_to_incident(self, incident_id: str, message: dict, exclude_unit: str | None = None):
        """Broadcast to all units connected to this incident, optionally skipping one."""
        if incident_id not in self.active_connections:
            return

        payload = json.dumps(message)
        dead = []
        for unit_id, ws in self.active_connections[incident_id].items():
            if exclude_unit and unit_id == exclude_unit:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(unit_id)
        for unit_id in dead:
            self.disconnect(incident_id, unit_id)

    def get_connected_count(self, incident_id: str) -> int:
        if incident_id in self.active_connections:
            return len(self.active_connections[incident_id])
        return 0

# Global instance
ws_manager = ConnectionManager()
