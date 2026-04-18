import json
import anthropic
from server.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, MAX_TOKENS
from server.channels.prompts import SUMMARY_PROMPT, CONFLICT_PROMPT, MAP_SUGGESTION_PROMPT, SEARCH_PROMPT

client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

async def generate_summary(communications: list[dict]) -> str:
    if not communications:
        return "Waiting for communications to generate incident summary..."
        
    messages_text = "\n".join([f"[{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}" for c in reversed(communications)])
    
    try:
        response = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=SUMMARY_PROMPT,
            messages=[{"role": "user", "content": f"Recent communications:\n{messages_text}"}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        print(f"Error generating summary: {e}")
        return None

async def detect_conflicts(communications: list[dict]) -> list[dict]:
    if not communications:
        return []
        
    messages_text = "\n".join([f"[{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}" for c in reversed(communications)])
    
    try:
        response = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=CONFLICT_PROMPT,
            messages=[{"role": "user", "content": f"Review these communications for conflicts:\n{messages_text}"}]
        )
        raw_text = response.content[0].text
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(raw_text[start:end])
            return parsed.get("conflicts", [])
    except Exception as e:
        print(f"Error detecting conflicts: {e}")
    return []

async def suggest_map_zones(latest_comm: dict, incident: dict, existing_zones: list[dict]) -> dict | None:
    content = f"""
    Incident Location: {incident['location_name']} ({incident['location_lat']}, {incident['location_lng']})
    Existing Zones: {json.dumps([{ 'type': z['zone_type'], 'label': z['label'] } for z in existing_zones])}
    
    Latest Communication:
    [{latest_comm['timestamp']}] {latest_comm['channel_id'].upper()} ({latest_comm['unit_callsign']}): {latest_comm['transcript']}
    """
    
    try:
        response = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=MAP_SUGGESTION_PROMPT,
            messages=[{"role": "user", "content": content}]
        )
        raw_text = response.content[0].text
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start != -1 and end > start:
            result = json.loads(raw_text[start:end])
            if result.get("suggest") is True:
                return result
    except Exception as e:
        print(f"Error suggesting map zones: {e}")
    return None

async def search_history(communications: list[dict], query: str) -> dict:
    if not communications:
        return {"results": [], "summary": "No communications found."}
        
    messages_text = "\n".join([f"ID: {c['id']} | [{c['timestamp']}] {c['channel_id'].upper()} ({c['unit_callsign']}): {c['transcript']}" for c in reversed(communications)])
    
    content = f"Query: {query}\n\nTranscripts:\n{messages_text}"
    
    try:
        response = await client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=MAX_TOKENS,
            system=SEARCH_PROMPT,
            messages=[{"role": "user", "content": content}]
        )
        raw_text = response.content[0].text
        start = raw_text.find("{")
        end = raw_text.rfind("}") + 1
        if start != -1 and end > start:
            return json.loads(raw_text[start:end])
    except Exception as e:
        print(f"Error searching history: {e}")
    
    return {"results": [], "summary": "Error performing search."}
