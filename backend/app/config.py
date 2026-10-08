"""Settings, read from the environment (and an optional backend/.env file)."""

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    path = BACKEND_DIR / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


class Settings:
    """Read on every call to get_settings(), so tests and restarts see current values."""

    def __init__(self) -> None:
        env = os.environ.get
        # SQLite file; each request opens its own connection.
        self.db_path = env("NB_DB_PATH", str(BACKEND_DIR / "data" / "notebook.db"))
        # The server's Anthropic key. Optional: without it the assistant is off (503) until
        # a key is set or a visitor brings their own.
        self.anthropic_key = env("ANTHROPIC_API_KEY", "")
        # Model for the agents. Opus 5.5 by default; set NB_AGENT_MODEL to change it.
        self.agent_model = env("NB_AGENT_MODEL", "claude-opus-5-5")
        self.agent_max_tokens = int(env("NB_AGENT_MAX_TOKENS", "16000"))
        # Tool-call rounds per request. Stops a confused agent from looping forever.
        self.agent_max_steps = int(env("NB_AGENT_MAX_STEPS", "12"))
        # Optional shared secret. When set, every /api request except /api/health
        # must send it as `Authorization: Bearer <token>`.
        self.api_token = env("NB_API_TOKEN", "")
        # "local": one notebook, no logins (the default for running on your own machine).
        # "accounts": email + password sign-up, each user sees only their own notes.
        self.auth_mode = env("NB_AUTH_MODE", "local").lower()
        # Signs login tokens. A random one is kept in data/secret.key when unset.
        self.secret_key = env("NB_SECRET_KEY", "")
        self.token_days = int(env("NB_TOKEN_DAYS", "30"))
        self.allow_registration = env("NB_ALLOW_REGISTRATION", "1") not in ("0", "false", "no")
        # Agent requests per user per day, and requests per minute (auth + agents).
        self.agent_daily_calls = int(env("NB_AGENT_DAILY_CALLS", "50"))
        self.rate_per_minute = int(env("NB_RATE_PER_MINUTE", "20"))
        self.cors_origins = [
            o.strip()
            for o in env("NB_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
            if o.strip()
        ]


def get_settings() -> Settings:
    return Settings()
