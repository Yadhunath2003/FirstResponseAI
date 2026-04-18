let currentParsedIncident = null;
let dispatchRecognition = null;
let dispatchIsListening = false;
let dispatchFinalTranscript = '';

function _setCreateBtnEnabled(enabled) {
    const btn = document.getElementById('create-incident-btn-dispatch');
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.4';
    btn.style.cursor = enabled ? 'pointer' : 'default';
}

function _setStatusMsg(text, color = '#aaa') {
    const el = document.getElementById('dispatch-status-msg');
    el.textContent = text;
    el.style.color = color;
}

// ── Location search for manual geocode fix ────────────────────────────────────
function initPreviewLocationSearch() {
    const searchInput = document.getElementById('prev-location-search');
    const resultsDiv = document.getElementById('prev-location-results');
    let timer = null;

    searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        const q = searchInput.value.trim();
        if (q.length < 3) { resultsDiv.style.display = 'none'; return; }
        timer = setTimeout(async () => {
            try {
                const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=us`;
                const res = await fetch(url, { headers: { 'User-Agent': 'FirstResponseAI/2.0' } });
                const items = await res.json();
                resultsDiv.innerHTML = '';
                if (!items.length) { resultsDiv.style.display = 'none'; return; }
                items.forEach(r => {
                    const d = document.createElement('div');
                    d.textContent = r.display_name;
                    d.style.cssText = 'padding:8px 10px; cursor:pointer; border-bottom:1px solid #222; font-size:0.85em; color:#ddd;';
                    d.addEventListener('mouseenter', () => d.style.background = '#2a2a2a');
                    d.addEventListener('mouseleave', () => d.style.background = '');
                    d.addEventListener('click', () => {
                        currentParsedIncident.location_lat = parseFloat(r.lat);
                        currentParsedIncident.location_lng = parseFloat(r.lon);
                        currentParsedIncident.location_display = r.display_name;
                        searchInput.value = r.display_name;
                        resultsDiv.style.display = 'none';
                        document.getElementById('prev-location').innerHTML = '<span style="color:#4caf50">✓ resolved</span>';
                        document.getElementById('prev-location-search-wrap').style.display = 'none';
                        _setCreateBtnEnabled(true);
                    });
                    resultsDiv.appendChild(d);
                });
                resultsDiv.style.display = 'block';
            } catch (e) { resultsDiv.style.display = 'none'; }
        }, 300);
    });

    document.addEventListener('click', e => {
        if (!searchInput.contains(e.target) && !resultsDiv.contains(e.target))
            resultsDiv.style.display = 'none';
    });
}

// ── Render parsed preview ─────────────────────────────────────────────────────
function renderParsedPreview(data) {
    currentParsedIncident = data;

    const priorityMap = {
        emergency: '🔴 EMERGENCY',
        urgent:    '🟠 URGENT',
        routine:   '🟢 ROUTINE',
    };
    const priorityColor = { emergency: '#e74c3c', urgent: '#e67e22', routine: '#27ae60' };
    const p = (data.priority || 'routine').toLowerCase();

    document.getElementById('prev-type').textContent = (data.incident_type || '').replace(/_/g, ' ').toUpperCase();
    document.getElementById('prev-address').textContent = data.address || '—';
    document.getElementById('prev-desc').textContent = data.description || '—';
    document.getElementById('prev-notes').textContent = data.notes || '—';
    document.getElementById('prev-priority').textContent = priorityMap[p] || p;
    document.getElementById('prev-priority').style.color = priorityColor[p] || '#aaa';

    const locationEl = document.getElementById('prev-location');
    const searchWrap = document.getElementById('prev-location-search-wrap');
    if (data.location_lat) {
        locationEl.innerHTML = '<span style="color:#4caf50">✓ resolved</span>';
        searchWrap.style.display = 'none';
    } else {
        locationEl.innerHTML = '<span style="color:#e67e22">⚠ not resolved — please search manually</span>';
        searchWrap.style.display = 'block';
    }

    document.getElementById('dispatch-preview').style.display = 'block';
    _setCreateBtnEnabled(!!data.location_lat);
    _setStatusMsg('');
}

// ── Parse ─────────────────────────────────────────────────────────────────────
async function parseDispatchCall(transcript) {
    if (!transcript.trim()) return;
    const preview = document.getElementById('dispatch-preview');
    preview.style.display = 'block';
    preview.innerHTML = '<div style="color:#aaa; padding:12px;">Parsing...</div>';

    try {
        const res = await fetch('/api/dispatch/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Restore preview HTML (was overwritten with "Parsing...")
        preview.innerHTML = `
            <h3 style="color:#e74c3c; margin-bottom:12px; font-size:0.9em; letter-spacing:0.1em;">PARSED INCIDENT PREVIEW</h3>
            <div style="display:grid; grid-template-columns:120px 1fr; gap:6px; font-size:0.9em;">
                <span style="color:#666;">Type:</span>       <span id="prev-type" style="color:#fff;"></span>
                <span style="color:#666;">Address:</span>    <span id="prev-address" style="color:#fff;"></span>
                <span style="color:#666;">Description:</span><span id="prev-desc" style="color:#fff;"></span>
                <span style="color:#666;">Notes:</span>      <span id="prev-notes" style="color:#aaa; font-style:italic;"></span>
                <span style="color:#666;">Priority:</span>  <span id="prev-priority" style="font-weight:700;"></span>
                <span style="color:#666;">Location:</span>  <span id="prev-location"></span>
            </div>
            <div id="prev-location-search-wrap" style="display:none; margin-top:12px;">
                <div style="position:relative;">
                    <input type="text" id="prev-location-search" placeholder="Search address..." autocomplete="off"
                           style="width:100%; box-sizing:border-box; background:#1a1a1a; border:1px solid #444; color:#fff; padding:8px; border-radius:4px;" />
                    <div id="prev-location-results" style="display:none; position:absolute; top:100%; left:0; right:0; background:#1a1a1a; border:1px solid #333; border-radius:4px; z-index:100; max-height:180px; overflow-y:auto;"></div>
                </div>
            </div>`;

        renderParsedPreview(data);
        initPreviewLocationSearch();
    } catch (e) {
        preview.innerHTML = `<div style="color:#e74c3c; padding:12px;">Parse failed: ${e.message}</div>`;
    }
}

// ── Confirm ───────────────────────────────────────────────────────────────────
async function confirmDispatch() {
    if (!currentParsedIncident) return;

    _setCreateBtnEnabled(false);
    _setStatusMsg('Creating incident...', '#aaa');

    try {
        const res = await fetch('/api/dispatch/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parsed: currentParsedIncident }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const incident = await res.json();

        _setStatusMsg(`✓ Incident created — ${incident.name}`, '#4caf50');

        switchDashTab('operations');
        if (typeof initDashboardForIncident === 'function') {
            initDashboardForIncident(incident.id);
        }

        setTimeout(() => {
            currentParsedIncident = null;
            document.getElementById('dispatch-live-transcript').textContent = 'Press and hold to speak a dispatch call...';
            document.getElementById('dispatch-preview').style.display = 'none';
            _setStatusMsg('');
            _setCreateBtnEnabled(false);
        }, 2000);
    } catch (e) {
        _setStatusMsg(`Error: ${e.message}`, '#e74c3c');
        _setCreateBtnEnabled(true);
    }
}

// ── PTT / Speech ──────────────────────────────────────────────────────────────
function initDispatchConsole() {
    const pttBtn = document.getElementById('dispatch-ptt-btn');
    const transcriptEl = document.getElementById('dispatch-live-transcript');

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
        dispatchRecognition = new SR();
        dispatchRecognition.continuous = true;
        dispatchRecognition.interimResults = true;
        dispatchRecognition.lang = 'en-US';
        dispatchRecognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) dispatchFinalTranscript += event.results[i][0].transcript;
                else interim += event.results[i][0].transcript;
            }
            transcriptEl.textContent = dispatchFinalTranscript + interim;
            transcriptEl.style.fontStyle = 'normal';
            transcriptEl.style.color = '#fff';
        };
        dispatchRecognition.onerror = e => console.warn('Dispatch SR error:', e.error);
    }

    function startListening() {
        if (dispatchIsListening) return;
        dispatchIsListening = true;
        dispatchFinalTranscript = '';
        transcriptEl.textContent = 'Listening...';
        transcriptEl.style.color = '#e74c3c';
        pttBtn.style.background = '#922b21';
        pttBtn.style.boxShadow = '0 0 0 8px #e74c3c66';
        if (dispatchRecognition) { try { dispatchRecognition.start(); } catch (e) {} }
    }

    function stopListening() {
        if (!dispatchIsListening) return;
        dispatchIsListening = false;
        pttBtn.style.background = '#c0392b';
        pttBtn.style.boxShadow = '0 0 0 4px #e74c3c44';
        if (dispatchRecognition) dispatchRecognition.stop();
        const transcript = dispatchFinalTranscript.trim();
        if (transcript) parseDispatchCall(transcript);
    }

    pttBtn.addEventListener('mousedown', e => { e.preventDefault(); startListening(); });
    pttBtn.addEventListener('mouseup',   e => { e.preventDefault(); stopListening(); });
    pttBtn.addEventListener('touchstart', e => { e.preventDefault(); startListening(); }, { passive: false });
    pttBtn.addEventListener('touchend',   e => { e.preventDefault(); stopListening(); },  { passive: false });
}

document.addEventListener('DOMContentLoaded', initDispatchConsole);
