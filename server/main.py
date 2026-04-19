import os
import uuid
import aiofiles
from contextlib import asynccontextmanager
from datetime import timedelta

from livekit import api as lk_api

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Form, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from server.channels.manager import ChannelManager
from server.channels.schemas import UnitRegistration, IncidentCreate
from server.realtime.websocket import ws_manager
from server.storage.database import (
    init_db, create_incident, get_incidents,
    get_incident, register_unit, join_incident, get_unit, get_units_for_incident,
    create_map_zone, get_map_zones, get_latest_summary, get_initial_summary, get_pending_suggestions,
    resolve_suggestion, get_recent_communications,
    get_pending_dispatch, delete_pending_dispatch,
    store_summary,
    create_public_post, get_public_thread, get_standalone_awareness_posts, get_help_counts,
)
from server.ai.claude import search_history, parse_dispatch_call, geocode_address, generate_initial_summary
from server.config import LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL


channel_manager = ChannelManager()


def _livekit_room_name(incident_id: str, channel_id: str) -> str:
    # Room identity is the talkgroup: one per (incident, channel).
    return f"incident:{incident_id}:channel:{channel_id}"

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    os.makedirs("data/audio", exist_ok=True)
    os.makedirs("data/public_media", exist_ok=True)
    yield

app = FastAPI(title="FirstResponse AI", lifespan=lifespan)

os.makedirs("data/audio", exist_ok=True)
os.makedirs("data/public_media", exist_ok=True)
app.mount("/audio", StaticFiles(directory="data/audio"), name="audio_static")
app.mount("/public_media", StaticFiles(directory="data/public_media"), name="public_media_static")

# --- REGISTRATION & INCIDENTS ---

@app.post("/api/register")
async def register_unit_endpoint(reg: UnitRegistration):
    callsign = f"{reg.unit_type.replace('_', ' ').title()} {reg.unit_number}"
    
    unit_id = register_unit(callsign, reg.unit_type, reg.unit_number, reg.device_id)
    return {"unit_id": unit_id, "callsign": callsign}

@app.get("/api/incidents")
async def get_all_incidents():
    return get_incidents()

@app.post("/api/incidents")
async def create_new_incident(inc: IncidentCreate):
    incident_id = create_incident(inc.name, inc.incident_type, inc.location_name, inc.location_lat, inc.location_lng)
    print(f"[create] Incident {incident_id}: {inc.name}")

    try:
        initial_summary = await generate_initial_summary({
            "incident_type": inc.incident_type,
            "address": inc.location_name,
            "location_display": inc.location_name,
            "description": inc.name,
        })
        if initial_summary:
            store_summary(incident_id, initial_summary, 0)
            print(f"[create] Initial summary stored: {initial_summary[:120]}…")
    except Exception as e:
        print(f"[create] Initial summary generation failed: {e}")

    return get_incident(incident_id)

@app.get("/api/incidents/{incident_id}")
async def get_incident_details(incident_id: str):
    inc = get_incident(incident_id)
    if not inc:
        return JSONResponse(status_code=404, content={"error": "Not Found"})
    
    inc["units"] = get_units_for_incident(incident_id)
    summary = get_latest_summary(incident_id)
    initial = get_initial_summary(incident_id)
    inc["summary"] = summary["summary_text"] if summary else "No summary available."
    inc["initial_summary"] = initial["summary_text"] if initial else None
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
    parsed = payload.get("parsed", payload)

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
    print(f"[dispatch] Created incident {incident_id}: {incident_name}")

    try:
        initial_summary = await generate_initial_summary(parsed)
        if initial_summary:
            store_summary(incident_id, initial_summary, 0)
            print(f"[dispatch] Initial summary stored ({len(initial_summary)} chars): {initial_summary[:120]}…")
            from datetime import datetime, timezone
            await ws_manager.broadcast_to_incident(incident_id, {
                "type": "summary_update",
                "summary_text": initial_summary,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        else:
            print("[dispatch] generate_initial_summary returned empty string")
    except Exception as e:
        print(f"[dispatch] Initial summary generation failed: {e}")

    return get_incident(incident_id)


@app.post("/api/incidents/{incident_id}/regenerate-summary")
async def regenerate_initial_summary(incident_id: str, payload: dict | None = None):
    """Regenerate an initial-style summary for an existing incident.

    Useful for incidents created before the initial-summary feature existed,
    or when the intake fields have been edited. Falls back to the stored
    incident row if the client doesn't send fresh form data.
    """
    inc = get_incident(incident_id)
    if not inc:
        return JSONResponse(status_code=404, content={"error": "Not Found"})

    data = dict(payload or {})
    data.setdefault("incident_type", inc.get("incident_type", "other"))
    data.setdefault("address", inc.get("location_name"))
    data.setdefault("location_display", inc.get("location_name"))
    data.setdefault("description", inc.get("name"))

    summary = await generate_initial_summary(data)
    if not summary:
        return JSONResponse(status_code=500, content={"error": "Summary generation returned empty"})

    store_summary(incident_id, summary, 0)
    from datetime import datetime, timezone
    await ws_manager.broadcast_to_incident(incident_id, {
        "type": "summary_update",
        "summary_text": summary,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    print(f"[regenerate] Summary stored for {incident_id}: {summary[:120]}…")
    return {"summary_text": summary}

# --- LIVEKIT TOKEN ---

@app.post("/api/livekit/token")
async def issue_livekit_token(payload: dict):
    """Mint a short-lived JWT for a single (incident, channel) room.

    Body: {
      incident_id: str, channel_id: str, unit_id: str, callsign: str,
      can_publish?: bool,   # default true; dashboard sends false for listen-only
      can_subscribe?: bool, # default true
    }
    Returns: { url, token, room } — client connects with livekit-client.
    """
    if not (LIVEKIT_API_KEY and LIVEKIT_API_SECRET and LIVEKIT_URL):
        return JSONResponse(
            status_code=503,
            content={"error": "LiveKit not configured. Set LIVEKIT_URL/API_KEY/API_SECRET."},
        )

    incident_id = payload.get("incident_id")
    channel_id = payload.get("channel_id")
    unit_id = payload.get("unit_id")
    callsign = payload.get("callsign") or unit_id or "unknown"
    if not (incident_id and channel_id and unit_id):
        return JSONResponse(
            status_code=400,
            content={"error": "incident_id, channel_id, unit_id required"},
        )

    can_publish = bool(payload.get("can_publish", True))
    can_subscribe = bool(payload.get("can_subscribe", True))

    room = _livekit_room_name(incident_id, channel_id)
    grant = lk_api.VideoGrants(
        room=room,
        room_join=True,
        can_publish=can_publish,
        can_subscribe=can_subscribe,
        can_publish_data=True,
    )
    # identity must be unique per connection; participant name is the human label.
    token = (
        lk_api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(unit_id)
        .with_name(callsign)
        .with_grants(grant)
        # 6h TTL — long enough for a shift, short enough to limit blast radius.
        .with_ttl(timedelta(hours=6))
        .to_jwt()
    )
    return {"url": LIVEKIT_URL, "token": token, "room": room}


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

@app.post("/api/dispatch/parse")
async def parse_dispatch(payload: dict):
    import json
    from server.channels.prompts import DISPATCH_PARSE_PROMPT
    transcript = payload.get("transcript", "")
    if not transcript:
        return JSONResponse(status_code=400, content={"error": "transcript required"})
    try:
        import google.generativeai as genai
        from server.config import GEMINI_API_KEY
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(DISPATCH_PARSE_PROMPT + f"\n\nTranscript: {transcript}")
        raw = response.text.strip()
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(raw[start:end])
            if not parsed.get("location_lat") and parsed.get("address"):
                try:
                    import httpx
                    geo_url = f"https://nominatim.openstreetmap.org/search?q={parsed['address']}&format=json&limit=1"
                    async with httpx.AsyncClient() as client:
                        geo_res = await client.get(geo_url, headers={"User-Agent": "FirstResponseAI/1.0"})
                        geo_data = geo_res.json()
                        if geo_data:
                            parsed["location_lat"] = float(geo_data[0]["lat"])
                            parsed["location_lng"] = float(geo_data[0]["lon"])
                            parsed["location_display"] = geo_data[0]["display_name"]
                except Exception as e:
                    print(f"Geocoding failed: {e}")
            return parsed
    except Exception as e:
        print(f"Dispatch parse error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/dispatch/confirm")
async def confirm_dispatch(payload: dict):
    parsed = payload.get("parsed", {})
    name = parsed.get("description") or f"{parsed.get('incident_type', 'Incident').replace('_', ' ').title()}"
    if parsed.get("address"):
        name = f"{name} — {parsed['address']}"
    incident_id = create_incident(
        name=name[:100],
        incident_type=parsed.get("incident_type", "other"),
        location_name=parsed.get("location_display") or parsed.get("address") or "Unknown",
        lat=parsed.get("location_lat") or 38.9592,
        lng=parsed.get("location_lng") or -95.2453,
    )
    return get_incident(incident_id)
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

# --- PUBLIC / COMMUNITY ---

PUBLIC_HELP_TYPES = {"ride", "shelter", "supplies", "safe", "check", "other"}
PUBLIC_KINDS = {"awareness", "comment", "help", "need"}


def _public_incident_view(inc: dict) -> dict:
    """Strip fields that shouldn't appear on the public map/feed."""
    return {
        "id": inc["id"],
        "name": inc.get("name"),
        "incident_type": inc.get("incident_type"),
        "location_name": inc.get("location_name"),
        "location_lat": inc.get("location_lat"),
        "location_lng": inc.get("location_lng"),
        "status": inc.get("status"),
        "created_at": inc.get("created_at"),
    }


async def _save_public_media(media: UploadFile | None) -> str | None:
    if not media or not media.filename:
        return None
    safe = f"{uuid.uuid4().hex}_{media.filename}"
    full_path = f"data/public_media/{safe}"
    async with aiofiles.open(full_path, "wb") as out_file:
        await out_file.write(await media.read())
    return f"/public_media/{safe}"


@app.get("/api/public/incidents")
async def public_list_incidents():
    items = [_public_incident_view(i) for i in get_incidents() if i.get("status") == "active"]
    return items


@app.get("/api/public/incidents/{incident_id}")
async def public_get_incident(incident_id: str, lang: str = "en"):
    inc = get_incident(incident_id)
    if not inc:
        return JSONResponse(status_code=404, content={"error": "Not Found"})
    view = _public_incident_view(inc)
    summary = get_latest_summary(incident_id) or get_initial_summary(incident_id)
    summary_text = summary["summary_text"] if summary else ""

    if summary_text and lang and lang != "en":
        try:
            from server.ai.claude import _ask
            translated = await _ask(
                "Rewrite the following dispatch summary in plain, calm, non-technical language for the public. "
                f"Respond in language code '{lang}'. Keep it under 120 words. Do not invent details.",
                summary_text,
            )
            if translated:
                summary_text = translated.strip()
        except Exception as e:
            print(f"[public] translate failed: {e}")

    view["summary"] = summary_text
    view["help_counts"] = get_help_counts(incident_id)
    return view


@app.get("/api/public/incidents/{incident_id}/thread")
async def public_get_incident_thread(incident_id: str):
    return get_public_thread(incident_id)


import uuid


@app.post("/api/public/incidents/{incident_id}/posts")
async def public_create_incident_post(
    incident_id: str,
    kind: str = Form(...),
    author_name: str = Form("Neighbor"),
    body: str | None = Form(None),
    help_type: str | None = Form(None),
    parent_id: str | None = Form(None),
    media: UploadFile = File(None),
):
    if kind not in PUBLIC_KINDS or kind == "awareness":
        return JSONResponse(status_code=400, content={"error": "invalid kind"})
    if kind == "help" and help_type not in PUBLIC_HELP_TYPES:
        return JSONResponse(status_code=400, content={"error": "invalid help_type"})
    if not get_incident(incident_id):
        return JSONResponse(status_code=404, content={"error": "incident not found"})

    media_url = await _save_public_media(media)
    post = create_public_post(
        incident_id=incident_id,
        parent_id=parent_id,
        kind=kind,
        author_name=author_name.strip() or "Neighbor",
        body=(body or "").strip() or None,
        help_type=help_type,
        media_url=media_url,
    )
    await ws_manager.broadcast_to_incident(incident_id, {
        "type": "public_post",
        "post": post,
    })
    return post


@app.get("/api/public/awareness")
async def public_list_awareness():
    return get_standalone_awareness_posts()


@app.post("/api/public/awareness")
async def public_create_awareness(
    author_name: str = Form("Neighbor"),
    body: str = Form(...),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    media: UploadFile = File(None),
):
    media_url = await _save_public_media(media)
    post = create_public_post(
        incident_id=None,
        parent_id=None,
        kind="awareness",
        author_name=author_name.strip() or "Neighbor",
        body=body.strip(),
        media_url=media_url,
        lat=lat,
        lng=lng,
    )
    return post


# --- WEBSOCKET ---

@app.websocket("/ws/{incident_id}/{unit_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str, unit_id: str):
    # The WS is now purely the incident event bus (zones, summary, dispatch,
    # unit_joined, conflicts). Voice transport is LiveKit.
    await ws_manager.connect(incident_id, unit_id, websocket)
    try:
        while True:
            # Clients don't need to push anything through this channel today;
            # drain and ignore so the socket stays open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(incident_id, unit_id)
