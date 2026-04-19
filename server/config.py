import os
from dotenv import load_dotenv

# Support both `.env` (canonical) and `.env.local` (Next.js-style) in the
# repo root. Whichever the user happened to create, we pick it up. `.env.local`
# wins when both exist, matching Next.js semantics.
load_dotenv(".env")
load_dotenv(".env.local", override=True)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1024"))

DB_PATH = os.getenv("DB_PATH", "data/incident.db")

MAX_CHANNEL_HISTORY = int(os.getenv("MAX_CHANNEL_HISTORY", "20"))

# LiveKit (voice transport). Cloud project or self-hosted.
# URL is the wss://… endpoint clients connect to; key/secret mint JWTs server-side.
LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")
