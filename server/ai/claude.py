import json
import google.generativeai as genai
from server.config import GEMINI_API_KEY
from server.channels.prompts import SUMMARY_PROMPT, CONFLICT_PROMPT, MAP_SUGGESTION_PROMPT, SEARCH_PROMPT

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.5-pro")

async def _ask(system, user):
    try:
        response = model.generate_content(system + "\n\n" + user)
        return response.text
    except Exception as e:
        print(f"Gemini error: {e}")
        return None

async def generate_summary(communications):
    if not communications:
        return "Waiting for communications..."
    msgs = "\n".join([f"[{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}" for c in reversed(communications)])
    return await _ask(SUMMARY_PROMPT, f"Recent communications:\n{msgs}")

async def detect_conflicts(communications):
    if not communications:
        return []
    msgs = "\n".join([f"[{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}" for c in reversed(communications)])
    raw = await _ask(CONFLICT_PROMPT, f"Review these communications:\n{msgs}")
    if not raw:
        return []
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(raw[start:end]).get("conflicts", [])
    except:
        pass
    return []

async def suggest_map_zones(latest_comm, incident, existing_zones):
    content = f"""
    Incident Location: {incident['location_name']} ({incident['location_lat']}, {incident['location_lng']})
    Existing Zones: {json.dumps([{'type': z['zone_type'], 'label': z['label']} for z in existing_zones])}
    Latest Communication:
    [{latest_comm['timestamp']}] {latest_comm['channel_id'].upper()} ({latest_comm['unit_callsign']}): {latest_comm['transcript']}
    """
    raw = await _ask(MAP_SUGGESTION_PROMPT, content)
    if not raw:
        return None
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start != -1 and end > start:
            result = json.loads(raw[start:end])
            if result.get("suggest") is True:
                return result
    except:
        pass
    return None

async def search_history(communications, query):
    if not communications:
        return {"results": [], "summary": "No communications found."}
    msgs = "\n".join([f"ID: {c['id']} | [{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}" for c in reversed(communications)])
    raw = await _ask(SEARCH_PROMPT, f"Query: {query}\n\nTranscripts:\n{msgs}")
    if not raw:
        return {"results": [], "summary": "Error performing search."}
    try:
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(raw[start:end])
    except:
        pass
    return {"results": [], "summary": raw}