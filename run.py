#!/usr/bin/env python3
"""Launch FirstResponse AI server with HTTPS."""
import uvicorn
from server.config import HOST, PORT
from server.utils.network import ensure_ssl_certs, get_server_url, generate_qr

if __name__ == "__main__":
    certfile, keyfile = ensure_ssl_certs()
    url = get_server_url(PORT)
    print(f"\n  Starting at {url}")
    print(f"  NOTE: You'll need to accept the self-signed cert in your browser.\n")

    uvicorn.run(
        "server.main:app",
        host=HOST,
        port=PORT,
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
    )
