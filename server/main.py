import os
import aiofiles
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from server.config import PORT
from server.channels.manager import ChannelManager
from server.channels.schemas import UnitRegistration, IncidentCreate
from server.realtime.websocket import ws_manager
from server.storage.database import (
    init_db, create_incident, get_active_incident, get_incidents,
    get_incident, register_unit, join_incident, get_unit, get_units_for_incident,
    create_map_zone, get_map_zones, get_latest_summary, get_pending_suggestions,
    resolve_suggestion, get_recent_communications
)
from server.ai.claude import search_history
from server.utils.network import get_server_url, generate_qr


channel_manager = ChannelManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    os.makedirs("data/audio", exist_ok=True)
    url = get_server_url(PORT)
    print(f"\n{'='*50}")
    print(f"  FirstResponse AI Server Running (V2)")
    print(f"  Phone UI:   {url}")
    print(f"  Dashboard:  {url}/dashboard")
    print(f"{'='*50}")
    generate_qr(url)
    print()
    yield

app = FastAPI(title="FirstResponse AI", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("data/audio", exist_ok=True)
app.mount("/dashboard", StaticFiles(directory="dashboard", html=True), name="dashboard")
app.mount("/static", StaticFiles(directory="client"), name="client_static")
app.mount("/audio", StaticFiles(directory="data/audio"), name="audio_static")

@app.get("/")
async def serve_client():
    return FileResponse("client/index.html")

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
    
    # Broadcast join
    unit = get_unit(unit_id)
    if unit:
        await ws_manager.broadcast_to_incident(incident_id, {
            "type": "unit_joined",
            "unit_callsign": unit["callsign"],
            "unit_type": unit["unit_type"]
        })
    return {"status": "joined"}

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
    await ws_manager.connect(incident_id, unit_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(incident_id, unit_id)
