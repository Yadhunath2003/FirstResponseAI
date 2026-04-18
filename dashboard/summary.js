let currentSummaryText = "";

async function refreshSummary(incidentId) {
    try {
        const res = await fetch(`/api/incidents/${incidentId}/summary`);
        const data = await res.json();
        if (data.summary_text) {
            document.getElementById('ai-summary-text').innerText = data.summary_text;
            currentSummaryText = data.summary_text;
        }
    } catch (e) {
        console.error("Failed to fetch summary", e);
    }
}

let currentZones = [];

async function refreshSuggestions(incidentId) {
    try {
        const [suggRes, zoneRes] = await Promise.all([
            fetch(`/api/incidents/${incidentId}/suggestions`),
            fetch(`/api/incidents/${incidentId}/zones`)
        ]);
        const suggestions = await suggRes.json();
        currentZones = await zoneRes.json();
        
        const list = document.getElementById('suggestions-list');
        list.innerHTML = "";
        
        if (suggestions.length === 0) {
            list.innerHTML = '<div class="empty-state">No pending suggestions.</div>';
            return;
        }
        
        suggestions.forEach(sugg => {
            const el = document.createElement('div');
            el.className = 'suggestion-card';
            el.innerHTML = `
                <div style="flex-grow:1;">
                    <strong>🗺️ ${sugg.suggestion_type.toUpperCase()} ZONE</strong><br>
                    <small>${sugg.description}</small>
                </div>
                <div style="display:flex; flex-direction: column; gap:4px;">
                    <button class="primary-btn" style="font-size:10px;" onclick="resolveSuggestion('${sugg.id}', 'accept', '${sugg.suggestion_type}', ${sugg.data_json?.radius_meters || 500})">Approve</button>
                    <button class="secondary-btn" style="font-size:10px;" onclick="resolveSuggestion('${sugg.id}', 'reject', '${sugg.suggestion_type}', 0)">Reject</button>
                </div>
            `;
            list.appendChild(el);
        });
    } catch (e) {
        console.error("Failed to load suggestions", e);
    }
}

async function resolveSuggestion(suggId, action, zoneType, radius) {
    try {
        if (action === 'accept') {
            const zoneGroups = {
                danger: ['danger', 'hot', 'evacuation', 'evacuation_route'],
                hot: ['danger', 'hot', 'evacuation', 'evacuation_route'],
                evacuation: ['danger', 'hot', 'evacuation', 'evacuation_route'],
                evacuation_route: ['danger', 'hot', 'evacuation', 'evacuation_route'],
                warm: ['warm'],
                cold: ['cold', 'safe'],
                safe: ['cold', 'safe'],
                staging_area: ['staging_area', 'staging'],
                staging: ['staging_area', 'staging'],
                landing_zone: ['landing_zone', 'landing'],
                landing: ['landing_zone', 'landing'],
            };
            
            const relatedTypes = zoneGroups[zoneType] || [zoneType];
            const toDelete = currentZones.filter(z => relatedTypes.includes(z.zone_type));
            console.log('Deleting zones:', toDelete.map(z => z.zone_type));
            
            await Promise.all(toDelete.map(z =>
                fetch(`/api/incidents/${currentIncidentId}/zones/${z.id}`, { method: 'DELETE' })
            ));
        }

        await fetch(`/api/incidents/${currentIncidentId}/suggestions/${suggId}/${action}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                resolved_by: dashUnitId || 'Viewer',
                lat: incidentLocation[0],
                lng: incidentLocation[1],
                radius: radius
            })
        });
        await refreshSuggestions(currentIncidentId);
        await refreshMapZones(currentIncidentId);
    } catch (e) {
        console.error("Failed to resolve suggestion", e);
    }
}
