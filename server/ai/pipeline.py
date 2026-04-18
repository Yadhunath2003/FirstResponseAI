import asyncio
from datetime import datetime, timezone
import json

from server.ai.claude import generate_summary, detect_conflicts, suggest_map_zones
from server.storage.database import (
    get_incident,
    get_recent_communications,
    store_summary,
    get_map_zones,
    store_suggestion
)
from server.realtime.websocket import ws_manager


async def run_ai_pipeline(incident_id: str, new_comm: dict):
    """
    Runs the 3-step AI pipeline asynchronously without blocking the main thread.
    """
    incident = get_incident(incident_id)
    if not incident:
        return
        
    # Get last 15-30 messages for context
    communications = get_recent_communications(incident_id, limit=20)
    if not communications:
        return
        
    # Step 1: Summary Update
    summary_text = await generate_summary(communications)
    if summary_text:
        store_summary(incident_id, summary_text, len(communications))
        now = datetime.now(timezone.utc).isoformat()
        await ws_manager.broadcast_to_incident(incident_id, {
            "type": "summary_update",
            "summary_text": summary_text,
            "timestamp": now
        })

    # Step 2: Conflict Detection
    # Only run conflict detection if there's enough context
    if len(communications) > 1:
        conflicts = await detect_conflicts(communications)
        for conflict in conflicts:
            await ws_manager.broadcast_to_incident(incident_id, {
                "type": "conflict",
                "description": conflict.get("description", "Potential conflict detected"),
                "severity": conflict.get("severity", "medium"),
                "channels_involved": conflict.get("channels_involved", []),
                "units_involved": conflict.get("units_involved", [])
            })

    # Step 3: Map Zone Suggestion
    existing_zones = get_map_zones(incident_id)
    suggestion = await suggest_map_zones(new_comm, incident, existing_zones)
    if suggestion:
        stored_sugg = store_suggestion(
            incident_id, 
            suggestion.get("zone_type", "unknown"),
            suggestion.get("description", "Suggested zone based on communications"),
            suggestion
        )
        
        await ws_manager.broadcast_to_incident(incident_id, {
            "type": "zone_suggestion",
            "suggestion_id": stored_sugg["id"],
            "zone_type": suggestion.get("zone_type", "unknown"),
            "reason": suggestion.get("reason", "Based on radio traffic"),
            "description": suggestion.get("description", "Suggested map update")
        })

def trigger_ai_pipeline(incident_id: str, new_comm: dict):
    """
    Fire-and-forget helper to start the pipeline in the background.
    """
    asyncio.create_task(run_ai_pipeline(incident_id, new_comm))
