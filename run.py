#!/usr/bin/env python3
"""Launch the FastAPI backend on plain HTTP, loopback-only.

The Next.js dev server on port 3000 reverse-proxies /api, /ws, and /audio to
this process, so clients (including phones on the LAN) only ever talk to
Next.js. Because we're loopback-only and plaintext, there's no SSL cert to
generate, install, or accept for the backend.

Usage:
    python3 run.py
"""
import uvicorn

if __name__ == "__main__":
    print("FastAPI on http://127.0.0.1:8000 (loopback only).")
    print("Start the frontend with `npm run dev` in frontend/.")
    uvicorn.run(
        "server.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )
