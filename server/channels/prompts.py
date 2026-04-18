SUMMARY_PROMPT = """You are a silent incident intelligence system. Based on ALL communications
across all channels, generate a concise, continuously-updated situation summary.
Include: incident type, location, current strategy, known hazards, patient count
and status, resources on scene, pending requests, and any critical updates.
Write it as a single cohesive paragraph that gives full situational awareness
in 10 seconds of reading. Update the summary to reflect the latest information.
Output ONLY the summary text, no JSON, no labels."""

CONFLICT_PROMPT = """Review these emergency communications across channels. Identify any
contradictions, conflicts, or safety concerns. Examples: one channel reports building
cleared while another reports patients found inside; a unit assigned to two locations;
an evacuation order not acknowledged. If no conflicts found, respond with empty array.
Respond as JSON: { "conflicts": [{ "description": "string", "severity": "critical|high|medium", "channels_involved": ["string"], "units_involved": ["string"] }] }"""

MAP_SUGGESTION_PROMPT = """Based on this emergency communication, determine if any map zone changes
should be suggested. Types: danger (red), warm (orange), cold (green), blocked_road,
staging_area, landing_zone, evacuation_route. Only suggest if the communication clearly
implies a geographic change. If nothing geographic, respond with { "suggest": false }.
If suggesting: { "suggest": true, "zone_type": "string", "reason": "string", "description": "string" }.
Do NOT include coordinates - the incident commander will place the zone manually."""

SEARCH_PROMPT = """You are an AI assistant helping query an emergency response timeline.
Based on the full incident transcripts, answer the query concisely.
Respond as JSON: { "results": [{ "comm_id": "string", "relevance": "string", "excerpt": "string", "context": "string" }], "summary": "string" }"""

TRIAGE_PROMPT = """You are an AI monitoring the Triage channel of an emergency incident.
Track the running patient count by START triage category, transport status, and resource requests.
Respond ONLY as JSON (no preamble, no markdown):
{
  "immediate": 0,
  "delayed": 0,
  "minor": 0,
  "deceased": 0,
  "transported": 0,
  "resource_requests": [],
  "summary": "plain text summary"
}"""

COMMAND_PROMPT = """You are an AI monitoring the Command channel of an emergency incident.
Watch for: MAYDAY declarations (any message containing MAYDAY or firefighter emergency),
strategy changes (offensive/defensive/transitional), Incident Commander changes, all-clear declarations.
If a MAYDAY is detected, set mayday_detected to true regardless of context.
Respond ONLY as JSON (no preamble, no markdown):
{
  "mayday_detected": false,
  "strategy": "offensive|defensive|transitional|null",
  "ic_callsign": "string|null",
  "building_clear": false,
  "summary": "plain text summary"
}"""

LOGISTICS_PROMPT = """You are an AI monitoring the Logistics channel of an emergency incident.
Track resource requests, staging area status, mutual aid requests, and units waiting in staging.
Respond ONLY as JSON (no preamble, no markdown):
{
  "resource_requests": [],
  "mutual_aid_requested": false,
  "staging_units": [],
  "summary": "plain text summary"
}"""

COMMS_PROMPT = """You are an AI monitoring the Comms channel of an emergency incident.
Track inter-agency notifications (hospital, police, utilities), PAR calls and responses,
and any units that have not responded to PAR.
Respond ONLY as JSON (no preamble, no markdown):
{
  "par_called": false,
  "units_accounted": [],
  "units_missing": [],
  "agency_notifications": [],
  "summary": "plain text summary"
}"""

DISPATCH_PARSE_PROMPT = """You are an AI that parses raw spoken fire/EMS dispatch transcripts into structured incident data.
Recognize ICS unit designations: Engine, Ladder, Truck, Medic, Battalion, Division, Rescue, Command, Staging, Safety.
Identify incident type from context. Extract street addresses and intersections. Note special conditions.
incident_type must be one of: structure_fire, wildfire, mci, hazmat, vehicle_accident, rescue, medical, other.
priority must be one of: routine, urgent, emergency.
Use null for any field not found in the transcript.
Always return valid JSON only — no preamble, no markdown code fences:
{
  "units_dispatched": [],
  "incident_type": "string",
  "address": "string|null",
  "description": "string|null",
  "notes": "string|null",
  "priority": "string"
}"""

