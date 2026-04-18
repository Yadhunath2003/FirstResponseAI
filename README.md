# FirstResponse AI

Voice-first incident-command app for emergency responders. A Next.js web app
(phone + operator views) talks to a FastAPI backend; Gemini handles dispatch
parsing and AI summaries.

For how the project fits together, see [WHATS_UP.md](WHATS_UP.md).

## Prerequisites

- **Python 3.11+** ([download](https://www.python.org/downloads/))
- **Node.js 20+** ([download](https://nodejs.org/))
- A **Gemini API key** from <https://aistudio.google.com/apikey>

## One-time setup

### macOS / Linux

```bash
git clone <this-repo> && cd FirstResponseAI

# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Env
cp .env.example .env
# → open .env and paste your GEMINI_API_KEY

# Frontend
cd frontend && npm install && cd ..
```

### Windows (PowerShell)

```powershell
git clone <this-repo> ; cd FirstResponseAI

# Backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Env
copy .env.example .env
# → open .env and paste your GEMINI_API_KEY

# Frontend
cd frontend ; npm install ; cd ..
```

If PowerShell blocks `Activate.ps1`, run once:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Running

**Two terminals**, both from the repo root:

```
# Terminal 1 — backend (activate venv first)
python run.py

# Terminal 2 — frontend
cd frontend
npm run dev
```

The first `npm run dev` on a new machine auto-generates a self-signed cert for
`localhost` + your LAN IP (via `scripts/ensure-certs.mjs`). No openssl needed.

### Open the app

- **Your laptop:** <https://localhost:3000>
- **Phone on the same Wi-Fi:** `https://<your-laptop-lan-ip>:3000` — accept
  the self-signed cert warning once.

Find your LAN IP:

| OS | Command |
| --- | --- |
| macOS | `ipconfig getifaddr en0` |
| Linux | `hostname -I` |
| Windows | `ipconfig` → look for "IPv4 Address" under your Wi-Fi adapter |

The Next.js dev server reverse-proxies `/api`, `/ws`, and `/audio` to the
backend, so everything goes through a single origin with a single cert.

## Troubleshooting

- **Phone shows "can't reach server":** accept the cert by opening the
  URL in the phone browser first (Advanced → Proceed). Then reload.
- **"Same Wi-Fi" really matters** — guest networks often isolate clients.
- **Windows firewall:** allow Node on "Private networks" on first prompt.
- **Backend won't start:** make sure the venv is activated and `GEMINI_API_KEY`
  is set in `.env`.
