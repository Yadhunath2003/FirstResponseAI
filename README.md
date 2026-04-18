# FirstResponse AI

Voice-first incident-command app for emergency responders. A Next.js web app
(phone + operator views) talks to a FastAPI backend; Gemini handles dispatch
parsing and AI summaries.

For how the project fits together, see [WHATS_UP.md](WHATS_UP.md).

## Quick start

Two terminals.

```bash
# 1) Backend — plain HTTP on loopback only
pip install -r requirements.txt
python3 run.py

# 2) Frontend — HTTPS on :3000 for Mac and phone
cd frontend
npm install
npm run dev
```

Then:

- **Mac:** open <https://localhost:3000>
- **Phone:** open `https://<your-mac-lan-ip>:3000`, accept the self-signed cert
  once (both Mac and phone are on the same Wi-Fi)

The Next.js dev server reverse-proxies `/api`, `/ws`, and `/audio` to the
backend, so everything goes through a single origin and a single cert.

## What you need

- Python 3.11+
- Node 20+
- A `GEMINI_API_KEY` in `.env` (copy from `.env.example` if provided, or set
  the var directly)
