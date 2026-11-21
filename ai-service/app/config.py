
import os
from pathlib import Path
from dotenv import load_dotenv

# Root project directory
PROJECT_ROOT = Path(__file__).resolve().parents[2]

AI_SERVICE_ROOT = Path(__file__).resolve().parents[1]

# Development must use a dedicated, shared internal token. Never source the
# backend's non-development environment when explicitly running locally.
if os.getenv("NODE_ENV") == "development":
    development_env_path = AI_SERVICE_ROOT / ".env.development"
    if not development_env_path.is_file():
        raise RuntimeError("AI service development configuration is missing.")
    load_dotenv(development_env_path, override=True)
else:
    # Preserve existing non-development configuration precedence.
    load_dotenv(PROJECT_ROOT / "backend" / ".env")
    load_dotenv(AI_SERVICE_ROOT / ".env")

AI_SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN")
if os.getenv("NODE_ENV") == "development" and (not AI_SERVICE_TOKEN or len(AI_SERVICE_TOKEN) < 32):
    raise RuntimeError("AI_SERVICE_TOKEN must be configured for development.")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL")

AI_SERVICE_HOST = os.getenv("AI_SERVICE_HOST", "127.0.0.1")
AI_SERVICE_PORT = int(os.getenv("AI_SERVICE_PORT", "8000"))

MAX_IMAGE_SIZE_MB = int(os.getenv("MAX_IMAGE_SIZE_MB", "5"))
MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "25000000"))
GEMINI_TIMEOUT_MS = int(os.getenv("GEMINI_TIMEOUT_MS", "8000"))
