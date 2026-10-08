"""Research Notebook backend.

    cd backend
    .venv\\Scripts\\python -m uvicorn app.main:app --reload --port 8000

Set NB_AUTH_MODE=accounts to require sign-in (see config.py). When `dist/` (the built
frontend) sits next to this folder, it is served too, so one process is the whole app.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from . import db as store
from .agent.router import router as agent_router
from .auth import router as auth_router
from .config import BACKEND_DIR, get_settings
from .notes import router as notes_router

DIST = BACKEND_DIR.parent / "dist"

# Pyodide and its wasm come from a CDN, hence the jsdelivr / wasm allowances.
CSP = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net blob:; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob:; "
    "font-src 'self' data: https://cdn.jsdelivr.net; manifest-src 'self'; "
    "connect-src 'self' https://cdn.jsdelivr.net https://pypi.org https://files.pythonhosted.org; "
    "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
)


class SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        # Behind a TLS-terminating proxy (Caddy, ALB) the original scheme arrives in this header.
        if request.headers.get("x-forwarded-proto") == "https" or request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        if not request.url.path.startswith("/api"):
            response.headers.setdefault("Content-Security-Policy", CSP)
        return response


def create_app() -> FastAPI:
    app = FastAPI(title="Research Notebook API", version="0.2.0")
    app.add_middleware(SecurityHeaders)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health():
        settings = get_settings()
        with store.db() as conn:
            count = conn.execute("SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL").fetchone()[0]
        return {
            "ok": True,
            "notes": count,
            "model": settings.agent_model,
            "ai": bool(settings.anthropic_key),
            # The browser reads these to decide whether to show the sign-in screen.
            "auth": settings.auth_mode,
            "registration": settings.allow_registration,
            "dailyAgentCalls": settings.agent_daily_calls,
        }

    app.include_router(auth_router)
    app.include_router(notes_router)
    app.include_router(agent_router)

    if DIST.is_dir():
        app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404, "Not found")
            target = (DIST / path).resolve()
            if path and target.is_file() and DIST.resolve() in target.parents:
                return FileResponse(target)
            return FileResponse(DIST / "index.html")

    return app


app = create_app()
