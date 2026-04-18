let activeChannel = null;
let channels = [];
let wsClient = null;
let currentIncidentId = null;
let audioPlayer = null;

// DOM refs
const grid = document.getElementById('channel-grid');
const micBtn = document.getElementById('mic-btn');
const msgTicker = document.getElementById('message-ticker');
const liveTranscript = document.getElementById('live-transcript');
const statusDot = document.getElementById('status-dot');
const incidentList = document.getElementById('incident-list');

// Setup UI interactions
document.addEventListener('DOMContentLoaded', () => {
    // Top-level Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.target === 'tab-map') return; // Redirects handled inline
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // Create Incident Modal logic
    document.getElementById('create-incident-btn').addEventListener('click', () => {
        document.getElementById('create-incident-modal').classList.remove('hidden');
    });
    document.getElementById('cancel-incident-btn').addEventListener('click', () => {
        document.getElementById('create-incident-modal').classList.add('hidden');
    });
    document.getElementById('submit-incident-btn').addEventListener('click', createAndJoinIncident);

    // Audio Playback
    if(window.AudioPlaybackManager) {
        audioPlayer = new AudioPlaybackManager();
    }
});

async function loadIncidents() {
    try {
        const res = await fetch('/api/incidents');
        const incidents = await res.json();
        incidentList.innerHTML = '';
        if (incidents.length === 0) {
            incidentList.innerHTML = '<p>No active incidents found.</p>';
            return;
        }

        incidents.forEach(inc => {
            const el = document.createElement('div');
            el.className = 'incident-card';
            el.innerHTML = `
                <div style="flex-grow:1;">
                    <strong>${inc.name}</strong><br>
                    <small>Type: ${inc.incident_type} | Units: ${inc.unit_count || 0}</small>
                </div>
                <button onclick="joinIncident('${inc.id}', '${inc.name}')" class="primary-btn">Join</button>
            `;
            incidentList.appendChild(el);
        });
    } catch (err) {
        console.error(err);
    }
}

async function createAndJoinIncident() {
    const name = document.getElementById('inc-name').value.trim();
    const type = document.getElementById('inc-type').value;
    const location = document.getElementById('inc-location-name').value.trim();
    const lat = document.getElementById('inc-lat').value;
    const lng = document.getElementById('inc-lng').value;

    if(!name) return alert("Incident name required");

    try {
        const res = await fetch('/api/incidents', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: name,
                incident_type: type,
                location_name: location,
                location_lat: parseFloat(lat),
                location_lng: parseFloat(lng)
            })
        });
        const inc = await res.json();
        joinIncident(inc.id, inc.name);
    } catch(err) {
        alert("Failed to create incident");
    }
}

async function joinIncident(incId, incName) {
    currentIncidentId = incId;
    try {
        await fetch(`/api/incidents/${incId}/join`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ unit_id: myUnitId })
        });

        document.getElementById('main-incident-name').innerText = incName;
        document.getElementById('main-callsign').innerText = myCallsign;
        document.getElementById('dashboard-iframe').src = `/dashboard?embed=true&incident_id=${incId}&unit_id=${myUnitId}`;
        
        await initChannels();
        showScreen('screen-main');
        
        initWebSocket();
        initVoiceCapture();

    } catch(err) {
        console.error(err);
        alert("Failed to join");
    }
}

async function initChannels() {
    try {
        const res = await fetch(`/api/incidents/${currentIncidentId}/channels`);
        channels = await res.json();
        renderChannels();
    } catch (e) {
        console.log("Failed to load generic channels");
    }
}

function renderChannels() {
    grid.innerHTML = '';
    channels.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'channel-card';
        card.dataset.channelId = ch.id;
        card.style.borderColor = ch.color + '44';

        card.innerHTML = `
            <div class="card-header">
                <span class="channel-name" style="color:${ch.color}">${ch.name}</span>
                <span class="priority-dot" id="dot-${ch.id}"></span>
            </div>
            <div class="card-body ready" id="body-${ch.id}">
                ${ch.last_message || 'Listening...'}
            </div>
        `;

        card.addEventListener('click', () => selectChannel(ch.id, ch.color));
        grid.appendChild(card);
    });
}

function selectChannel(channelId, color) {
    // Only one single channel can be selected at a time
    activeChannel = channelId;
    document.querySelectorAll('.channel-card').forEach(c => {
        const cid = c.dataset.channelId;
        const ch = channels.find(x => x.id === cid);
        c.classList.remove('active');
        if (ch) c.style.borderColor = '#111';
    });

    const card = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (card) {
        card.classList.add('active');
        card.style.borderColor = color;
    }

    micBtn.disabled = false;
    document.getElementById('ptt-label').innerText = "HOLD TO TALK";
    
    if(audioPlayer) {
        audioPlayer.unlockAudio();
    }
}

let voiceRecorder = null;

function initVoiceCapture() {
    if(window.VoiceCaptureManager) {
        voiceRecorder = new VoiceCaptureManager(
            (interimTranscript) => {
                liveTranscript.innerText = interimTranscript;
            },
            async (formData) => {
                liveTranscript.innerText = '';
                if (!activeChannel) return;
                
                formData.append("channel_id", activeChannel);
                formData.append("unit_id", myUnitId);
                formData.append("incident_id", currentIncidentId);
                
                micBtn.classList.remove("recording");
                document.getElementById('ptt-label').innerText = "SENDING...";
                
                try {
                    await fetch('/api/voice', { method: 'POST', body: formData });
                } catch(err) {
                    console.error("Voice send failed", err);
                } finally {
                    document.getElementById('ptt-label').innerText = "HOLD TO TALK";
                }
            }
        );
    }
}

// Touch events for PTT
micBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!activeChannel || micBtn.disabled || !voiceRecorder) return;
    
    micBtn.classList.add("recording");
    document.getElementById('ptt-label').innerText = "RECORDING...";
    voiceRecorder.startRecording();
    if(audioPlayer) audioPlayer.unlockAudio(); // Resume UI AudioContext on touch
});

micBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (voiceRecorder && voiceRecorder.isRecording) {
        voiceRecorder.stopRecording();
    }
});

// Using mouse fallback for ease of testing on laptop
micBtn.addEventListener('mousedown', (e) => {
    if (!activeChannel || micBtn.disabled || !voiceRecorder) return;
    micBtn.classList.add("recording");
    document.getElementById('ptt-label').innerText = "RECORDING...";
    voiceRecorder.startRecording();
    if(audioPlayer) audioPlayer.unlockAudio(); 
});
micBtn.addEventListener('mouseup', (e) => {
    if (voiceRecorder && voiceRecorder.isRecording) {
        voiceRecorder.stopRecording();
    }
});


// WebSocket Handling
function initWebSocket() {
    if(!currentIncidentId || !myUnitId) return;
    wsClient = new WebSocketClient(currentIncidentId, myUnitId, handleWSMessage, handleWSStatus);
    wsClient.connect();
}

function handleWSStatus(status) {
    statusDot.className = 'status-dot ' + status;
}

function handleWSMessage(msg) {
    if (msg.type === 'audio') {
        processIncomingAudio(msg);
    } else if (msg.type === 'conflict' && msg.severity === 'critical') {
        showCriticalAlert(msg);
    } else if (msg.type === 'alert' && msg.priority === 'critical') {
        showCriticalAlert(msg);
    }
}

function processIncomingAudio(msg) {
    const ch = channels.find(c => c.id === msg.channel_id);
    if (!ch) return;

    // Flash the card
    const card = document.querySelector(`[data-channel-id="${msg.channel_id}"]`);
    if (card) {
        card.classList.remove('flash');
        void card.offsetWidth;
        card.classList.add('flash');
    }

    // Update body with latest snippet
    const bodyEl = document.getElementById(`body-${msg.channel_id}`);
    if (bodyEl) {
        bodyEl.classList.remove('ready');
        bodyEl.textContent = `[${msg.unit_callsign}] ${msg.transcript.slice(0, 40)}...`;
    }

    // Update the ticker
    msgTicker.innerHTML = `<span style="color:${ch.color}">[${msg.unit_callsign}]:</span> ${msg.transcript}`;

    // Play audio ONLY if this channel is actively selected
    if (activeChannel === msg.channel_id && audioPlayer && msg.audio_url) {
        audioPlayer.queueAudio(msg.audio_url);
    }
}

function showCriticalAlert(msg) {
    const title = document.getElementById('alert-title');
    const text = document.getElementById('alert-text');
    const alertDiv = document.getElementById('full-screen-alert');
    
    title.innerText = "CRITICAL PRIORITY";
    text.innerText = msg.description || msg.message || "Unknown Conflict / Alert";
    
    alertDiv.classList.remove("hidden");
    
    if(audioPlayer) audioPlayer.playAlertTone();
    
    // Auto dismiss after 8s
    setTimeout(() => {
        alertDiv.classList.add("hidden");
    }, 8000);
}

document.getElementById('alert-dismiss').addEventListener('click', () => {
    document.getElementById('full-screen-alert').classList.add("hidden");
});
