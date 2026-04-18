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

async function refreshSuggestions(incidentId) {
    try {
        const res = await fetch(`/api/incidents/${incidentId}/suggestions`);
        const suggestions = await res.json();
        
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
                    <strong>🗺️ ${sugg.suggestion_type.toUpperCase()} ZONE</strong><br>                    <small>${sugg.description}</small>
                </div>
                <div style="display:flex; flex-direction: column; gap:4px;">
                    <button class="primary-btn" style="font-size: 10px;" onclick="resolveSuggestion('${sugg.id}', 'accept')">Approve</button>
                    <button class="secondary-btn" style="font-size: 10px;" onclick="resolveSuggestion('${sugg.id}', 'reject')">Reject</button>
                </div>
            `;
            list.appendChild(el);
        });
    } catch (e) {
        console.error("Failed to load suggestions", e);
    }
}

async function resolveSuggestion(suggId, action) {
    try {
        await fetch(`/api/incidents/${currentIncidentId}/suggestions/${suggId}/${action}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                resolved_by: dashUnitId || 'Viewer',
                lat: incidentLocation[0],
                lng: incidentLocation[1],
                radius: 8046  // 5 miles in meters
            })
        });
        await refreshSuggestions(currentIncidentId);
        await refreshMapZones(currentIncidentId);  // ADD THIS — refresh map after approval
    } catch (e) {
        console.error("Failed to resolve suggestion", e);
    }
}
