# What's up with this

A short tour of how this project works, where the code lives, and the
reasoning behind the moving parts.

## The one-origin setup

The thing people trip on first is networking, so it goes first.

- **FastAPI** runs on `http://127.0.0.1:8000` — loopback only, plaintext.
  Nothing on your LAN or your phone ever reaches it directly.
- **Next.js** runs on `https://0.0.0.0:3000` with a self-signed cert that's
  auto-generated on first `npm run dev` (see
  `frontend/scripts/ensure-certs.mjs`). It covers `localhost` + every
  non-loopback IPv4 the machine has, so the same cert works on the laptop
  and on a phone over Wi-Fi. Certs live in `certs/` and are gitignored — each
  teammate gets their own on first run, so the cert matches their LAN IP.
- **Next.js reverse-proxies** `/api/*`, `/ws/*`, and `/audio/*` to FastAPI
  (see `frontend/next.config.ts`). That includes WebSockets — Next's built-in
  rewrite proxy handles the HTTP upgrade.
- **The browser only ever talks to `:3000`.** Same-origin everywhere, so
  there's no CORS config, no second cert to accept, no `NEXT_PUBLIC_API_URL`
  to set. The frontend uses relative URLs (`/api/...`) for REST and derives
  `ws(s)://<host>/ws/...` from `window.location` at runtime.

Why bother: HTTPS is required for mic + geolocation on mobile, so something
has to serve HTTPS. Doing it at the Next layer is simpler than juggling two
certs or a dev-time reverse proxy, and it means the phone accepts exactly one
cert warning.

## Running it

Two processes, both in foreground so logs are easy to read:

```bash
python3 run.py                 # backend
cd frontend && npm run dev     # frontend
```

`run.py` is deliberately tiny — it starts uvicorn on `127.0.0.1:8000` with no
SSL. The `dev` script in `frontend/package.json` runs
`next dev -H 0.0.0.0 --experimental-https --experimental-https-key …
--experimental-https-cert …`, pointing at the generated cert in `certs/`. A
`predev` step runs `scripts/ensure-certs.mjs` first so the cert always exists
before Next starts. Cert generation is pure Node (`selfsigned` npm package),
so Windows machines don't need openssl.

## Directory layout

```
firstresponseai/
├── run.py                 # launches FastAPI (HTTP, loopback)
├── requirements.txt       # Python deps
├── certs/                 # self-signed cert reused by Next dev server
├── data/                  # SQLite DB + saved audio clips (gitignored)
├── server/                # FastAPI backend
│   ├── main.py            # routes (REST + WebSocket)
│   ├── config.py          # env config (DB path, Gemini key, etc.)
│   ├── ai/                # Gemini calls: dispatch parse, summary, search
│   ├── channels/          # channel manager, unit/incident schemas
│   ├── realtime/          # WebSocket manager
│   └── storage/           # SQLite DAL
└── frontend/              # Next.js 16 app (App Router, React 19, Tailwind 4)
    ├── next.config.ts     # rewrites → FastAPI
    ├── app/
    │   ├── page.tsx             # landing
    │   ├── responder/…          # phone-facing screens (register, incidents, PTT)
    │   └── dashboard/…          # operator screens (incident list, detail, dispatch)
    ├── components/
    │   ├── create-incident-dialog.tsx  # shared create flow (phone + operator)
    │   ├── incident-map.tsx, leaflet-map.tsx  # map with zones
    │   ├── ptt-button.tsx       # push-to-talk (MediaRecorder + SpeechRecognition)
    │   ├── timeline.tsx, summary-panel.tsx, connection-badge.tsx
    │   └── ui/                  # shadcn/ui base-nova primitives
    └── lib/
        ├── api.ts               # typed REST client (same-origin)
        ├── ws.ts                # WebSocket hook with reconnect
        ├── audio.ts             # PTT helper
        ├── session.ts           # Zustand store (persisted unit info)
        ├── env.ts               # API_URL + WS base helper
        ├── types.ts             # mirrors FastAPI schemas
        └── utils.ts             # cn() helper
```

## What each side does

**Backend (FastAPI + SQLite + Gemini).** Stateless HTTP endpoints for
register / incidents / dispatch / zones / summaries / search, plus a WS
endpoint `/ws/{incident}/{unit}` that broadcasts updates (new comms, zone
changes, unit joins) to everyone on the incident. Audio clips are written to
`data/audio/` and served from `/audio/*`. See `server/main.py` for the full
route list.

**Frontend (Next.js App Router).** Two entry points off the landing page:

- `/responder` — phone flow: register a unit, pick or create an incident,
  join it, PTT into a channel, see the live timeline and map.
- `/dashboard` — operator flow: incident list, per-incident detail view
  (map + summary + units + AI suggestions + timeline), and
  `/dashboard/dispatch` for the voice-to-incident pipeline.

Both use the same `CreateIncidentDialog` for manual incident creation
(Nominatim geocoding + type picker). The responder side auto-joins the
incident it created; the operator side just navigates to it.

## Data flow for a typical voice transmission

1. Responder holds the PTT button → MediaRecorder captures audio while
   browser SpeechRecognition streams an interim transcript.
2. On release, frontend POSTs `audio blob + transcript + channel + unit +
   incident` to `/api/voice` (multipart).
3. Backend saves the clip, asks Gemini to process with the channel-specific
   prompt, writes the resulting `communication` to SQLite, and broadcasts it
   over the incident WebSocket.
4. Every connected client (phone + dashboard) receives the event and updates
   its timeline / summary / map without a refresh.

## Env / config

- Backend: copy `.env.example` → `.env` and fill in `GEMINI_API_KEY`. Other
  keys (`GEMINI_MODEL`, `MAX_TOKENS`, `DB_PATH`, `MAX_CHANNEL_HISTORY`) have
  sensible defaults — see `server/config.py`.
- Frontend: no env file needed by default. `frontend/.env.example` documents
  the two optional overrides — `NEXT_PUBLIC_API_URL` (point the browser at a
  different origin, skipping the rewrite proxy) and `BACKEND_URL` (point the
  rewrite proxy at a different backend host). Copy to `.env.local` if you need
  them.

## Gotchas worth knowing

- **Self-signed cert on phone.** Must be accepted once per device per
  install. If the cert in `certs/` is regenerated for a new LAN IP, every
  phone has to re-accept.
- **Same Wi-Fi.** Mac and phone must be on the same network (no "guest"
  SSID with client isolation, no cellular).
- **macOS firewall.** If inbound :3000 gets blocked, either allow Node in
  System Settings → Network → Firewall or turn the firewall off while
  demoing.
- **Backend is loopback-only.** This is intentional — `python3 run.py`
  binds `127.0.0.1`, not `0.0.0.0`. Do not "fix" that; it removes the
  point of the one-origin setup.
