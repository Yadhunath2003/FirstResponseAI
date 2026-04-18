import asyncio
import json
import google.generativeai as genai

from server.config import GEMINI_API_KEY, GEMINI_MODEL
from server.channels.prompts import (
    SUMMARY_PROMPT, CONFLICT_PROMPT, MAP_SUGGESTION_PROMPT, SEARCH_PROMPT,
    TRIAGE_PROMPT, COMMAND_PROMPT, LOGISTICS_PROMPT, COMMS_PROMPT,
    DISPATCH_PARSE_PROMPT,
)

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel(GEMINI_MODEL)


async def _ask(system: str, user: str) -> str | None:
    try:
        def _sync():
            return model.generate_content(system + "\n\n" + user).text
        return await asyncio.to_thread(_sync)
    except Exception as e:
        print(f"Gemini error: {e}")
        return None


def _parse_json(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(raw[start:end])
    except Exception:
        pass
    return None


async def generate_summary(communications: list[dict]) -> str:
    if not communications:
        return "Waiting for communications..."
    msgs = "\n".join([
        f"[{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    return await _ask(SUMMARY_PROMPT, f"Recent communications:\n{msgs}")


async def detect_conflicts(communications: list[dict]) -> list[dict]:
    if not communications:
        return []
    msgs = "\n".join([
        f"[{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    raw = await _ask(CONFLICT_PROMPT, f"Review these communications:\n{msgs}")
    result = _parse_json(raw)
    return result.get("conflicts", []) if result else []


async def suggest_map_zones(latest_comm: dict, incident: dict, existing_zones: list[dict]) -> dict | None:
    content = f"""
    Incident Location: {incident['location_name']} ({incident['location_lat']}, {incident['location_lng']})
    Existing Zones: {json.dumps([{'type': z['zone_type'], 'label': z['label']} for z in existing_zones])}
    Latest Communication:
    [{latest_comm['timestamp']}] {latest_comm['channel_id'].upper()} ({latest_comm['unit_callsign']}): {latest_comm['transcript']}
    """
    raw = await _ask(MAP_SUGGESTION_PROMPT, content)
    result = _parse_json(raw)
    if result and result.get("suggest") is True:
        return result
    return None


async def search_history(communications: list[dict], query: str) -> dict:
    if not communications:
        return {"results": [], "summary": "No communications found."}
    msgs = "\n".join([
        f"ID: {c['id']} | [{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    raw = await _ask(SEARCH_PROMPT, f"Query: {query}\n\nTranscripts:\n{msgs}")
    result = _parse_json(raw)
    if result:
        return result
    return {"results": [], "summary": raw or "Error performing search."}


async def geocode_address(address: str) -> dict | None:
    try:
        import requests
        def _sync():
            r = requests.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "us"},
                headers={"User-Agent": "FirstResponseAI/2.0"},
                timeout=5,
            )
            return r.json()
        results = await asyncio.to_thread(_sync)
        if results:
            r = results[0]
            return {"lat": float(r["lat"]), "lng": float(r["lon"]), "display": r["display_name"]}
        return None
    except Exception as e:
        print(f"Geocoding error: {e}")
        return None

async def parse_dispatch_call(transcript: str) -> dict:
    raw = await _ask(DISPATCH_PARSE_PROMPT, f"Dispatch transcript: {transcript}")
    return _parse_json(raw) or {}


async def analyze_triage(communications: list[dict]) -> dict | None:
    msgs = "\n".join([
        f"[{c['timestamp']}] ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    raw = await _ask(TRIAGE_PROMPT, f"Communications:\n{msgs}")
    return _parse_json(raw)


async def analyze_command(communications: list[dict]) -> dict | None:
    msgs = "\n".join([
        f"[{c['timestamp']}] ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    raw = await _ask(COMMAND_PROMPT, f"Communications:\n{msgs}")
    return _parse_json(raw)


async def analyze_logistics(communications: list[dict]) -> dict | None:
    msgs = "\n".join([
        f"[{c['timestamp']}] ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    raw = await _ask(LOGISTICS_PROMPT, f"Communications:\n{msgs}")
    return _parse_json(raw)


async def analyze_comms(communications: list[dict]) -> dict | None:
    msgs = "\n".join([
        f"[{c['timestamp']}] ({c['unit_callsign']}): {c['transcript']}"
        for c in reversed(communications)
    ])
    raw = await _ask(COMMS_PROMPT, f"Communications:\n{msgs}")
    return _parse_json(raw)


async def transcribe_audio(audio_path: str) -> str:
    try:
        import base64

        with open(audio_path, "rb") as f:
            audio_data = base64.b64encode(f.read()).decode("utf-8")

        ext = audio_path.split(".")[-1].lower()
        mime_map = {
            "mp4": "audio/mp4",
            "webm": "audio/webm",
            "ogg": "audio/ogg",
            "wav": "audio/wav",
            "m4a": "audio/mp4",
        }
        mime_type = mime_map.get(ext, "audio/webm")

        def _sync():
            return model.generate_content([
                {"inline_data": {"mime_type": mime_type, "data": audio_data}},
                "Transcribe this audio exactly as spoken. Output only the transcript text, nothing else."
            ]).text.strip()

        result = await asyncio.to_thread(_sync)
        print(f"Transcription success: '{result}'")
        return result
    except Exception as e:
        print(f"Transcription error: {e}")
        return ""
