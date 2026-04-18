import json
import sqlite3
import os
import uuid
from datetime import datetime, timezone

from server.config import DB_PATH

def _get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            location_name TEXT,
            location_lat REAL,
            location_lng REAL,
            created_at TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            metadata_json TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS units (
            id TEXT PRIMARY KEY,
            callsign TEXT NOT NULL,
            unit_type TEXT NOT NULL,
            unit_number TEXT NOT NULL,
            device_id TEXT NOT NULL,
            incident_id TEXT,
            joined_at TEXT,
            status TEXT DEFAULT 'active',
            UNIQUE(callsign, incident_id)
        );

        CREATE TABLE IF NOT EXISTS communications (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            unit_id TEXT NOT NULL,
            unit_callsign TEXT NOT NULL,
            transcript TEXT,
            audio_path TEXT,
            ai_annotations_json TEXT DEFAULT '{}',
            priority TEXT DEFAULT 'medium',
            timestamp TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );

        CREATE TABLE IF NOT EXISTS summaries (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            summary_text TEXT NOT NULL,
            generated_at TEXT NOT NULL,
            message_count_at_generation INTEGER,
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );

        CREATE TABLE IF NOT EXISTS map_zones (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            zone_type TEXT NOT NULL,
            center_lat REAL NOT NULL,
            center_lng REAL NOT NULL,
            radius_meters REAL NOT NULL,
            label TEXT,
            created_by TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            created_at TEXT NOT NULL,
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );

        CREATE TABLE IF NOT EXISTS suggestions (
            id TEXT PRIMARY KEY,
            incident_id TEXT NOT NULL,
            suggestion_type TEXT NOT NULL,
            description TEXT NOT NULL,
            data_json TEXT DEFAULT '{}',
            status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL,
            resolved_at TEXT,
            resolved_by TEXT,
            FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );
    """)
    conn.commit()
    conn.close()

# Incidents
def create_incident(name: str, incident_type: str, location_name: str, lat: float, lng: float) -> str:
    conn = _get_conn()
    incident_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO incidents (id, name, incident_type, location_name, location_lat, location_lng, created_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active')""",
        (incident_id, name, incident_type, location_name, lat, lng, now),
    )
    conn.commit()
    conn.close()
    return incident_id

def get_incidents() -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM incidents ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_incident(incident_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if row:
        row_dict = dict(row)
        # get unit count
        count = conn.execute("SELECT COUNT(*) as count FROM units WHERE incident_id = ?", (incident_id,)).fetchone()
        row_dict['unit_count'] = count['count']
        conn.close()
        return row_dict
    conn.close()
    return None

def get_active_incident() -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM incidents WHERE status = 'active' ORDER BY created_at DESC LIMIT 1").fetchone()
    conn.close()
    if not row:
         return None
    return get_incident(row['id'])

# Units
def register_unit(callsign: str, unit_type: str, unit_number: str, device_id: str) -> str:
    conn = _get_conn()
    # Check if already registered
    existing = conn.execute("SELECT id FROM units WHERE callsign = ?", (callsign,)).fetchone()
    if existing:
        conn.close()
        return existing['id']

    unit_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO units (id, callsign, unit_type, unit_number, device_id)
           VALUES (?, ?, ?, ?, ?)""",
        (unit_id, callsign, unit_type, unit_number, device_id),
    )
    conn.commit()
    conn.close()
    return unit_id

def join_incident(unit_id: str, incident_id: str):
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE units SET incident_id = ?, joined_at = ?, status = 'active' WHERE id = ?",
        (incident_id, now, unit_id)
    )
    conn.commit()
    conn.close()

def get_unit(unit_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM units WHERE id = ?", (unit_id,)).fetchone()
    conn.close()
    if row is None:
        return None
    return dict(row)

def get_units_for_incident(incident_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM units WHERE incident_id = ?", (incident_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Communications
def store_communication(
    incident_id: str,
    channel_id: str,
    unit_id: str,
    unit_callsign: str,
    transcript: str,
    audio_path: str,
) -> tuple[str, str]:
    conn = _get_conn()
    comm_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO communications
           (id, incident_id, channel_id, unit_id, unit_callsign, transcript, audio_path, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (comm_id, incident_id, channel_id, unit_id, unit_callsign, transcript, audio_path, now),
    )
    conn.commit()
    conn.close()
    return comm_id, now

def get_recent_communications(incident_id: str, limit: int = 50) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        """SELECT * FROM communications
           WHERE incident_id = ?
           ORDER BY timestamp DESC LIMIT ?""",
        (incident_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Summaries
def store_summary(incident_id: str, summary_text: str, message_count: int):
    conn = _get_conn()
    summary_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO summaries (id, incident_id, summary_text, generated_at, message_count_at_generation)
           VALUES (?, ?, ?, ?, ?)""",
        (summary_id, incident_id, summary_text, now, message_count),
    )
    conn.commit()
    conn.close()

def get_latest_summary(incident_id: str) -> dict | None:
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM summaries WHERE incident_id = ? ORDER BY generated_at DESC LIMIT 1",
        (incident_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None

# Map Zones
def create_map_zone(incident_id: str, zone_type: str, lat: float, lng: float, radius: float, label: str, created_by: str) -> dict:
    conn = _get_conn()
    zone_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO map_zones (id, incident_id, zone_type, center_lat, center_lng, radius_meters, label, created_by, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)""",
        (zone_id, incident_id, zone_type, lat, lng, radius, label, created_by, now)
    )
    conn.commit()
    
    row = conn.execute("SELECT * FROM map_zones WHERE id = ?", (zone_id,)).fetchone()
    conn.close()
    return dict(row)

def get_map_zones(incident_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM map_zones WHERE incident_id = ? AND status = 'active'", (incident_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# Suggestions
def store_suggestion(incident_id: str, suggestion_type: str, description: str, data: dict) -> dict:
    conn = _get_conn()
    suggestion_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO suggestions (id, incident_id, suggestion_type, description, data_json, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'pending', ?)""",
        (suggestion_id, incident_id, suggestion_type, description, json.dumps(data), now)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    conn.close()
    return dict(row)

def get_pending_suggestions(incident_id: str) -> list[dict]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM suggestions WHERE incident_id = ? AND status = 'pending'",
        (incident_id,)
    ).fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        d['data_json'] = json.loads(d['data_json'])
        results.append(d)
    return results

def resolve_suggestion(suggestion_id: str, status: str, resolved_by: str):
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE suggestions SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
        (status, now, resolved_by, suggestion_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM suggestions WHERE id = ?", (suggestion_id,)).fetchone()
    conn.close()
    d = dict(row)
    d['data_json'] = json.loads(d['data_json'])
    return d
