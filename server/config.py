import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "1024"))

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

DB_PATH = os.getenv("DB_PATH", "data/incident.db")

MAX_CHANNEL_HISTORY = int(os.getenv("MAX_CHANNEL_HISTORY", "20"))
