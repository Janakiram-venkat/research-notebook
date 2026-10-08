"""HTTP surface for the agents: list them, and chat with one over SSE."""

import json
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import anthropic

from .. import db as store
from ..auth import current_user
from ..config import get_settings
from ..limits import rate_limit, spend_agent_call
from .profiles import PROFILES
from . import runner

router = APIRouter(prefix="/api/agents", tags=["agents"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=50_000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    # The note the user has open, if any. Passed as context on the last user turn
    # (not in the system prompt, which would change on every request).
    focus_note_id: str | None = None


@router.get("", dependencies=[Depends(current_user)])
def list_agents():
    return [{"key": p.key, "name": p.name, "description": p.description} for p in PROFILES.values()]


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/{key}/chat")
async def chat(
    key: str,
    body: ChatIn,
    user: str = Depends(current_user),
    _: None = Depends(rate_limit("agent")),
    x_anthropic_key: str | None = Header(default=None),
):
    profile = PROFILES.get(key)
    if profile is None:
        raise HTTPException(404, f"No agent {key!r}")
    if body.messages[-1].role != "user":
        raise HTTPException(400, "The last message must be from the user")

    # A visitor's own Anthropic key is used for this request only (never stored or
    # logged) and is not counted against the daily budget; otherwise the server's key is.
    own_key = (x_anthropic_key or "").strip() or None
    if own_key is None:
        # Checked before spending the daily budget, so an unconfigured server costs nobody a request.
        if not get_settings().anthropic_key:
            raise HTTPException(503, "The AI assistant is not set up on this server yet.")
        spend_agent_call(user)

    messages = [m.model_dump() for m in body.messages]
    if body.focus_note_id:
        with store.db() as conn:
            note = store.get_note(conn, user, body.focus_note_id)
        if note:
            messages[-1]["content"] = (
                f"[The user has the note {note['title']!r} (id {note['id']}) open.]\n\n{messages[-1]['content']}"
            )

    factory = (lambda: anthropic.AsyncAnthropic(api_key=own_key)) if own_key else runner.default_client

    async def stream():
        async for event in runner.run_agent(profile, messages, client_factory=factory, user_id=user):
            yield _sse(event)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
