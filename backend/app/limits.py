"""Abuse limits: a per-minute request cap and a daily agent budget.

The per-minute window is in memory (one process); the daily budget is in the
`usage` table so it survives restarts. Both answer 429 with a sentence a person
can read.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from . import db as store
from .config import get_settings

_hits: dict[str, deque] = defaultdict(deque)


def reset() -> None:
    _hits.clear()


def _caller(request: Request) -> str:
    # Key on the token's user when there is one, otherwise the client address.
    from .auth import read_token

    bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    user = read_token(bearer) if bearer else None
    return user or (request.client.host if request.client else "unknown")


def rate_limit(bucket: str):
    def check(request: Request) -> None:
        limit = get_settings().rate_per_minute
        key = f"{bucket}:{_caller(request)}"
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "Too many requests. Wait a minute and try again.")
        q.append(now)

    return check


def spend_agent_call(user_id: str) -> None:
    """Count one agent request against today's budget, or raise 429."""
    budget = get_settings().agent_daily_calls
    day = time.strftime("%Y-%m-%d", time.gmtime())
    with store.db() as conn:
        row = conn.execute("SELECT calls FROM usage WHERE user_id = ? AND day = ?", (user_id, day)).fetchone()
        used = row["calls"] if row else 0
        if used >= budget:
            raise HTTPException(429, f"You have used today's {budget} AI requests. They reset at midnight UTC.")
        conn.execute(
            "INSERT INTO usage (user_id, day, calls) VALUES (?, ?, 1) "
            "ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1",
            (user_id, day),
        )
