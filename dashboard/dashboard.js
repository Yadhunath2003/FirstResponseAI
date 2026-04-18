const params = new URLSearchParams(window.location.search);
const isEmbedded = params.get('embed') === 'true';
let currentIncidentId = params.get('incident_id');
let dashUnitId = params.get('unit_id') || 'Viewer-' + Date.now().toString(36);

const timelineEl = document.getElementById('timeline');
const incidentNameEl = document.getElementById('incident-name');
let ws = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (isEmbedded) {
        document.getElementById('header-callsign').innerText = "Embedded Mode";
        if(currentIncidentId) {
            initDashboardForIncident(currentIncidentId);
        }
    } else {
        await loadIncidentPicker();
    }
    
    document.getElementById('timeline-search').addEventListener('input', debounce(async (e) => {
        const query = e.target.value;
        if(query.length > 2) {
            await searchTimeline(query);
        } else if(query.length === 0) {
            await loadTimeline(currentIncidentId);
        }
    }, 500));
});

async function loadIncidentPicker() {
    try {
        const res = await fetch('/api/incidents');
        const incidents = await res.json();
        
        const list = document.getElementById('dashboard-incident-list');
        list.innerHTML = '';
        if (incidents.length === 0) {
            list.innerHTML = '<p>No active incidents found.</p>';
            return;
        }

        incidents.forEach(inc => {
            const btn = document.createElement('button');
            btn.className = 'primary-btn';
            btn.style.width = '100%';
            btn.style.marginBottom = '10px';
            btn.innerText = `${inc.name}`;
            btn.onclick = () => {
                document.getElementById('dashboard-incident-picker').classList.add('hidden');
                initDashboardForIncident(inc.id);
            };
            list.appendChild(btn);
        });
    } catch(err) {
        console.error(err);
    }
}

async function initDashboardForIncident(incidentId) {
    currentIncidentId = incidentId;
    document.getElementById('dashboard-incident-picker').classList.add('hidden');
    document.getElementById('main-dashboard-wrap').classList.remove('hidden');
    
    try {
        const res = await fetch(`/api/incidents/${incidentId}`);
        const data = await res.json();
        incidentNameEl.innerText = data.name;
        
        initMap(data.location_lat, data.location_lng);
        await refreshMapZones(incidentId);
        await refreshSummary(incidentId);
        await refreshSuggestions(incidentId);
        await loadTimeline(incidentId);
        
        connectWebSocket(incidentId);
    } catch(err) {
        console.error("Failed to init dash", err);
    }
}

async function refreshMapZones(incidentId) {
    try {
        const res = await fetch(`/api/incidents/${incidentId}/zones`);
        const zones = await res.json();
        updateZones(zones);
    } catch(err) {
        console.error(err);
    }
}

async function loadTimeline(incidentId) {
    try {
        const res = await fetch(`/api/incidents/${incidentId}/timeline`);
        const comms = await res.json();
        renderTimeline(comms);
    } catch(err) {
        console.error(err);
    }
}

async function searchTimeline(query) {
    try {
        const res = await fetch(`/api/incidents/${currentIncidentId}/search`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ query: query })
        });
        const results = await res.json();
        renderTimeline(results);
    } catch(err) {
        console.error(err);
    }
}

function renderTimeline(comms) {
    timelineEl.innerHTML = '';
    if(comms.length === 0) {
        timelineEl.innerHTML = '<div class="empty-state">No communications found.</div>';
        return;
    }
    comms.slice().reverse().forEach(comm => {
        addTimelineEntry(comm);
    });
}

function connectWebSocket(incidentId) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws/${incidentId}/${dashUnitId}`;
    ws = new WebSocket(url);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWsMessage(msg);
        } catch (e) {
            console.error('Parse error:', e);
        }
    };

    ws.onclose = () => {
        setTimeout(() => connectWebSocket(incidentId), 3000);
    };
}

function handleWsMessage(msg) {
    switch (msg.type) {
        case 'audio':
            addTimelineEntry(msg);
            break;
        case 'summary_update':
            document.getElementById('ai-summary-text').innerText = msg.summary_text;
            break;
        case 'conflict':
            showCriticalAlert(msg);
            const alertC = {
                unit_callsign: "SYSTEM",
                transcript: `ALERT: ${msg.description}`,
                timestamp: new Date().toISOString()
            };
            addTimelineEntry(alertC, true);
            break;
        case 'zone_suggestion':
            refreshSuggestions(currentIncidentId);
            break;
        case 'zone_update':
            refreshMapZones(currentIncidentId);
            break;
    }
}

function addTimelineEntry(comm, isAlert = false) {
    const empty = timelineEl.querySelector('.empty-state');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = `timeline-entry ${isAlert ? 'critical' : ''}`;
    
    // In search mode, comm objects might be mapped differently, adjust as needed.
    // The base fields are unit_callsign, transcript, timestamp
    
    const time = comm.timestamp ? new Date(comm.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const callsign = comm.unit_callsign || comm.unitId || 'Unknown';
    const text = comm.transcript || comm.text || '';

    entry.innerHTML = `
        <div class="entry-header">
            <span>
                <span class="entry-channel" style="color:#aaa">[${callsign}]</span>
            </span>
            <span class="entry-time">${time}</span>
        </div>
        <div class="entry-body">${escapeHtml(text)}</div>
    `;

    timelineEl.prepend(entry); // prepend if newer is at top, or append if older at top. Let's append to put new at bottom.
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showCriticalAlert(msg) {
    const title = document.getElementById('alert-title');
    const text = document.getElementById('alert-text');
    const alertDiv = document.getElementById('full-screen-alert');
    
    title.innerText = "CONFLICT DETECTED";
    text.innerText = msg.description || msg.message || "Unknown Conflict";
    
    alertDiv.classList.remove("hidden");
    
    setTimeout(() => {
        alertDiv.classList.add("hidden");
    }, 8000);
}

document.getElementById('alert-dismiss')?.addEventListener('click', () => {
    document.getElementById('full-screen-alert').classList.add("hidden");
});
