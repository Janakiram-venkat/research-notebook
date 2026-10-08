"""Accounts: email + password, signed bearer tokens, and the `current_user` dependency.

Passwords use scrypt from the standard library. Tokens are `payload.signature`
(base64url JSON, HMAC-SHA256), so there is no extra dependency and nothing to store
server-side. In local mode (the default) there are no accounts and every request is
the single local owner, optionally gated by NB_API_TOKEN as before.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from . import db as store
from .config import get_settings
from .limits import rate_limit

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
LOCAL_USER = ""


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _secret() -> bytes:
    configured = get_settings().secret_key
    if configured:
        return configured.encode()
    # Next to the database, so it lives on the same persistent (and writable) volume.
    path = Path(get_settings().db_path).resolve().parent / "secret.key"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            # Owner-only and exclusive: no moment where the key is world-readable, and two
            # first requests cannot overwrite each other's key.
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(secrets.token_hex(32))
        except FileExistsError:
            pass  # another request created it first
    return path.read_text().strip().encode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{_b64(salt)}${_b64(digest)}"


def check_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=_unb64(salt), n=2**14, r=8, p=1)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(got, _unb64(digest))


def make_token(user_id: str) -> str:
    exp = int(time.time()) + get_settings().token_days * 86400
    body = _b64(json.dumps({"sub": user_id, "exp": exp}).encode())
    sig = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> str | None:
    try:
        body, sig = token.split(".")
        want = _b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, want):
            return None
        claims = json.loads(_unb64(body))
        return claims["sub"] if claims["exp"] > time.time() else None
    except Exception:
        return None


def current_user(request: Request) -> str:
    """The id whose notes this request may touch. Raises 401 when not allowed."""
    settings = get_settings()
    bearer = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if settings.auth_mode == "accounts":
        user_id = read_token(bearer) if bearer else None
        if not user_id:
            raise HTTPException(401, "Please sign in")
        return user_id
    if settings.api_token and not secrets.compare_digest(bearer, settings.api_token):
        raise HTTPException(401, "Missing or wrong API token")
    return LOCAL_USER


class Credentials(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=200)


def _session(user_id: str, email: str) -> dict:
    return {"token": make_token(user_id), "user": {"id": user_id, "email": email}}


@router.post("/register", dependencies=[Depends(rate_limit("auth"))])
def register(body: Credentials):
    settings = get_settings()
    if settings.auth_mode != "accounts":
        raise HTTPException(404, "Accounts are not enabled on this server")
    if not settings.allow_registration:
        raise HTTPException(403, "Sign-ups are closed on this server")
    email = body.email.strip().lower()
    if not EMAIL.match(email):
        raise HTTPException(422, "That does not look like an email address")
    user_id = "u" + uuid.uuid4().hex[:16]
    with store.db() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(409, "An account with that email already exists")
        first = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
        conn.execute(
            "INSERT INTO users (id, email, pw_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, email, hash_password(body.password), store.now_ms()),
        )
        if first:  # notes made before accounts existed go to the first person who signs up
            conn.execute("UPDATE notes SET user_id = ? WHERE user_id = ?", (user_id, LOCAL_USER))
    return _session(user_id, email)


@router.post("/login", dependencies=[Depends(rate_limit("auth"))])
def login(body: Credentials):
    email = body.email.strip().lower()
    with store.db() as conn:
        row = conn.execute("SELECT id, pw_hash FROM users WHERE email = ?", (email,)).fetchone()
    # Same message for "no such user" and "wrong password" so emails can't be probed.
    if row is None or not check_password(body.password, row["pw_hash"]):
        raise HTTPException(401, "Wrong email or password")
    return _session(row["id"], email)


@router.get("/me")
def me(user: str = Depends(current_user)):
    if get_settings().auth_mode != "accounts":
        return {"id": LOCAL_USER, "email": None}
    with store.db() as conn:
        row = conn.execute("SELECT id, email FROM users WHERE id = ?", (user,)).fetchone()
    if row is None:
        raise HTTPException(401, "Please sign in")
    return {"id": row["id"], "email": row["email"]}


@router.delete("/me", status_code=200)
def delete_account(user: str = Depends(current_user)):
    """Delete the account and every note it owns."""
    if get_settings().auth_mode != "accounts":
        raise HTTPException(404, "Accounts are not enabled on this server")
    with store.db() as conn:
        store.delete_all_notes(conn, user)
        conn.execute("DELETE FROM usage WHERE user_id = ?", (user,))
        conn.execute("DELETE FROM users WHERE id = ?", (user,))
    return {"deleted": True}
