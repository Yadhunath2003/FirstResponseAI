# FirstResponse AI

Voice-first, phone-based AI command interface for emergency first responders. A phone connects to a local server over WiFi, displays tappable channel cards, and routes voice input through Claude AI for emergency protocol processing.

## Quick Start

```bash
cd firstresponse-ai

# Setup (installs deps, creates .env)
python setup.py

# Add your Anthropic API key to .env
# ANTHROPIC_API_KEY=sk-ant-your-key-here

# Run (auto-generates self-signed SSL cert for mic access)
python run.py

# Open on phone: scan the QR code in terminal
# Accept the self-signed certificate warning in your browser
# Dashboard on laptop: https://localhost:8000/dashboard
```

## Architecture

- **Backend:** FastAPI with WebSocket support
- **AI:** Claude API with channel-specific ICS/NIMS system prompts
- **Database:** SQLite (designed for easy swap to Postgres/Supabase)
- **Phone UI:** Vanilla HTML/CSS/JS, PWA-ready, no build step
- **Voice:** Web Speech API (browser-native)
- **Network:** Local WiFi only, server binds to 0.0.0.0

## Channels

| Channel | Color | Purpose |
|---------|-------|---------|
| Command | Red | Incident Command, ICS protocols, strategy decisions |
| Triage | Orange | START triage, patient tracking by category |
| Logistics | Green | Resources, apparatus, staging, mutual aid |
| Comms | Blue | Inter-agency coordination, scene roster |

## How It Works

1. Phone opens server IP in mobile browser — no app install needed
2. Tap a channel card to select it
3. Tap mic, speak, release — transcript sent to server
4. Claude AI processes with channel-specific emergency protocols
5. Response broadcast to all connected phones via WebSocket
6. Dashboard shows live timeline of all communications
