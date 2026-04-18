import os
import aiofiles
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from server.channels.manager import ChannelManager
from server.channels.schemas import UnitRegistration, IncidentCreate
from server.realtime.websocket import ws_manager
from server.storage.database import (
    init_db, create_incident, get_incidents,
    get_incident, register_unit, join_incident, get_unit, get_units_for_incident,
    create_map_zone, get_map_zones, get_latest_summary, get_pending_suggestions,
    resolve_suggestion, get_recent_communications,
    get_pending_dispatch, delete_pending_dispatch,
)
from server.ai.claude import search_history, parse_dispatch_call, geocode_address


channel_manager = ChannelManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    os.makedirs("data/audio", exist_ok=True)
    yield

app = FastAPI(title="FirstResponse AI", lifespan=lifespan)

app.mount("/audio", StaticFiles(directory="data/audio"), name="audio_static")

# --- REGISTRATION & INCIDENTS ---

@app.post("/api/register")
async def register_unit_endpoint(reg: UnitRegistration):
    callsign = f"{reg.unit_type.replace('_', ' ').title()} {reg.unit_number}"
    if reg.unit_type.lower() == "command":
        callsign = "Command"
    if reg.unit_type.lower() == "staging":
        callsign = "Staging"
    
    unit_id = register_unit(callsign, reg.unit_type, reg.unit_number, reg.device_id)
    return {"unit_id": unit_id, "callsign": callsign}

@app.get("/api/incidents")
async def get_all_incidents():
    return get_incidents()

@app.post("/api/incidents")
async def create_new_incident(inc: IncidentCreate):
    incident_id = create_incident(inc.name, inc.incident_type, inc.location_name, inc.location_lat, inc.location_lng)
    return get_incident(incident_id)

@app.get("/api/incidents/{incident_id}")
async def get_incident_details(incident_id: str):
    inc = get_incident(incident_id)
    if not inc:
        return JSONResponse(status_code=404, content={"error": "Not Found"})
    
    inc["units"] = get_units_for_incident(incident_id)
    summary = get_latest_summary(incident_id)
    inc["summary"] = summary["summary_text"] if summary else "No summary available."
    inc["recent_comms"] = get_recent_communications(incident_id, 10)
    return inc

@app.post("/api/incidents/{incident_id}/join")
async def join_incident_endpoint(incident_id: str, payload: dict):
    unit_id = payload.get("unit_id")
    if not unit_id:
        return JSONResponse(status_code=400, content={"error": "unit_id required"})

    join_incident(unit_id, incident_id)

    unit = get_unit(unit_id)
    if unit:
        await ws_manager.broadcast_to_incident(incident_id, {
            "type": "unit_joined",
            "unit_callsign": unit["callsign"],
            "unit_type": unit["unit_type"],
        })

        pending = get_pending_dispatch(unit["callsign"])
        if pending and pending["incident_id"] == incident_id:
            inc = get_incident(incident_id)
            if inc:
                await ws_manager.send_to_unit(incident_id, unit_id, {
                    "type": "dispatched",
                    "incident_id": incident_id,
                    "incident_name": inc["name"],
                    "incident_type": inc["incident_type"],
                    "address": inc.get("location_name", ""),
                    "description": "",
                    "notes": "",
                    "priority": "emergency",
                    "assigned_channel": pending["channel_id"],
                    "report_to": f"{pending['channel_id'].title()} Channel",
                })
            delete_pending_dispatch(unit["callsign"])

    return {"status": "joined"}


@app.post("/api/dispatch/parse")
async def dispatch_parse_endpoint(payload: dict):
    transcript = payload.get("transcript", "")
    parsed = await parse_dispatch_call(transcript)

    geo = None
    if parsed.get("address"):
        geo = await geocode_address(parsed["address"])

    return {
        "units_mentioned": parsed.get("units_dispatched", []),
        "incident_type": parsed.get("incident_type", "other"),
        "address": parsed.get("address"),
        "description": parsed.get("description"),
        "notes": parsed.get("notes"),
        "priority": parsed.get("priority", "routine"),
        "location_lat": geo["lat"] if geo else None,
        "location_lng": geo["lng"] if geo else None,
        "location_display": geo["display"] if geo else None,
    }


@app.post("/api/dispatch/confirm")
async def dispatch_confirm_endpoint(payload: dict):
    parsed = payload.get("parsed", {})

    incident_type = parsed.get("incident_type", "other")
    address = parsed.get("address") or "Unknown Location"
    incident_name = f"{incident_type.replace('_', ' ').title()} — {address}"

    incident_id = create_incident(
        name=incident_name,
        incident_type=incident_type,
        location_name=parsed.get("location_display") or address,
        lat=parsed.get("location_lat") or 0.0,
        lng=parsed.get("location_lng") or 0.0,
    )
    return get_incident(incident_id)

# --- CHANNELS & VOICE ---

@app.get("/api/incidents/{incident_id}/channels")
async def get_channels(incident_id: str):
    return channel_manager.get_all_channels()

@app.post("/api/voice")
async def process_voice(
    channel_id: str = Form(...),
    transcript: str = Form(...),
    unit_id: str = Form(...),
    incident_id: str = Form(...),
    audio_blob: UploadFile = File(None)
):
    os.makedirs(f"data/audio/{incident_id}", exist_ok=True)
    
    audio_path = ""
    timestamp = ""
    if audio_blob:
        safe_filename = f"{unit_id}_{audio_blob.filename}"
        audio_path = f"{incident_id}/{safe_filename}"
        full_path = f"data/audio/{audio_path}"
        async with aiofiles.open(full_path, 'wb') as out_file:
            content = await audio_blob.read()
            await out_file.write(content)
        
        if not transcript or transcript == "[no transcript]":
            from server.ai.claude import transcribe_audio
            server_transcript = await transcribe_audio(full_path)
            print(f"SERVER TRANSCRIPTION RESULT: '{server_transcript}'")
            if server_transcript:
                transcript = server_transcript
            
    response_msg = await channel_manager.process_communication(
        channel_id, unit_id, incident_id, transcript, audio_path
    )
    
    if response_msg:
        await ws_manager.broadcast_to_incident(incident_id, response_msg)
        return {"status": "ok", "comm_id": response_msg.get("id", "")}
    
    return JSONResponse(status_code=400, content={"error": "Processing failed"})

# --- MAP ZONES ---

@app.get("/api/incidents/{incident_id}/zones")
async def get_zones(incident_id: str):
    return get_map_zones(incident_id)

@app.post("/api/incidents/{incident_id}/zones")
async def create_zone(incident_id: str, payload: dict):
    zone = create_map_zone(
        incident_id,
        payload.get("type", "unknown"),
        payload.get("lat", 0.0),
        payload.get("lng", 0.0),
        payload.get("radius", 0.0),
        payload.get("label", ""),
        payload.get("created_by", "system")
    )
    await ws_manager.broadcast_to_incident(incident_id, {
        "type": "zone_update",
        "zone_data": zone
    })
    return zone

# --- AI OUTPUTS ---

@app.get("/api/incidents/{incident_id}/summary")
async def get_incident_summary(incident_id: str):
    summary = get_latest_summary(incident_id)
    return {"summary_text": summary["summary_text"] if summary else ""}

@app.get("/api/incidents/{incident_id}/suggestions")
async def get_suggestions(incident_id: str):
    return get_pending_suggestions(incident_id)

@app.post("/api/incidents/{incident_id}/suggestions/{suggestion_id}/{action}")
async def resolve_zone_suggestion(incident_id: str, suggestion_id: str, action: str, payload: dict):
    resolved_by = payload.get("resolved_by", "system")
    if action not in ["accept", "reject"]:
        return JSONResponse(status_code=400, content={"error": "Invalid action"})
        
    sugg = resolve_suggestion(suggestion_id, action, resolved_by)
    
    if action == "accept" and sugg:
        zone_data = sugg.get("data_json", {})
        zone = create_map_zone(
            incident_id,
            zone_data.get("zone_type", "danger"),
            payload.get("lat", 0.0),
            payload.get("lng", 0.0),
            payload.get("radius", 0.0),
            zone_data.get("label", "AI Zone"),
            "ai_suggestion"
        )
        await ws_manager.broadcast_to_incident(incident_id, {
            "type": "zone_update",
            "zone_data": zone
        })
    return {"status": "resolved"}

@app.delete("/api/incidents/{incident_id}/zones/{zone_id}")
async def delete_zone(incident_id: str, zone_id: str):
    from server.storage.database import _get_conn
    conn = _get_conn()
    conn.execute("UPDATE map_zones SET status = 'deleted' WHERE id = ? AND incident_id = ?", (zone_id, incident_id))
    conn.commit()
    conn.close()
    await ws_manager.broadcast_to_incident(incident_id, {"type": "zones_refresh"})
    return {"status": "deleted"}

# --- DASHBOARD HISTORY ---

@app.get("/api/incidents/{incident_id}/timeline")
async def get_timeline(incident_id: str):
    return get_recent_communications(incident_id, limit=200)

@app.post("/api/incidents/{incident_id}/search")
async def search_incident_history(incident_id: str, payload: dict):
    query = payload.get("query", "")
    comms = get_recent_communications(incident_id, limit=500)
    results = await search_history(comms, query)
    return results

# --- WEBSOCKET ---

@app.websocket("/ws/{incident_id}/{unit_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str, unit_id: str):
    import json as _json
    await ws_manager.connect(incident_id, unit_id, websocket)

    # Tell the new peer who is already here, then announce them to the others.
    await ws_manager.send_to_unit(incident_id, unit_id, {
        "type": "peers",
        "peer_ids": ws_manager.get_peers(incident_id, exclude_unit=unit_id),
    })
    await ws_manager.broadcast_to_incident(incident_id, {
        "type": "peer_joined",
        "peer_id": unit_id,
    }, exclude_unit=unit_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = _json.loads(raw)
            except Exception:
                continue
            # WebRTC signaling relay: clients send {type:"signal", to:"<peer>", data:{...}}
            if msg.get("type") == "signal":
                target = msg.get("to")
                data = msg.get("data")
                if target and data is not None:
                    await ws_manager.send_to_unit(incident_id, target, {
                        "type": "signal",
                        "from": unit_id,
                        "data": data,
                    })
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(incident_id, unit_id)
        await ws_manager.broadcast_to_incident(incident_id, {
            "type": "peer_left",
            "peer_id": unit_id,
        })
