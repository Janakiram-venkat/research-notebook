"""Notes REST API.

Conflict rule: last write wins by `updatedAt`, but never silently. A write that is
older than what the server holds is refused (409) and the server's copy is
returned, so the client can show it instead of overwriting newer text.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from . import db as store
from .auth import current_user

router = APIRouter(prefix="/api/notes", tags=["notes"])


class NoteIn(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    title: str = "Untitled note"
    folder: str = "General"
    tags: list[str] = []
    pinned: bool = False
    content: list[dict[str, Any]] = []
    attachedTo: dict[str, Any] | None = None
    createdAt: int | None = None
    updatedAt: int | None = None
    deletedAt: int | None = None

    def to_record(self, existing: dict[str, Any] | None) -> dict[str, Any]:
        now = store.now_ms()
        rec = self.model_dump()
        rec["createdAt"] = self.createdAt or (existing["createdAt"] if existing else now)
        rec["updatedAt"] = self.updatedAt or now
        rec["title"] = self.title or "Untitled note"
        rec["folder"] = self.folder or "General"
        return rec


class SyncIn(BaseModel):
    since: int = 0
    notes: list[NoteIn] = []


def _apply(conn, user: str, incoming: NoteIn) -> tuple[bool, dict[str, Any]]:
    """Write `incoming` unless the server already holds something newer."""
    existing = store.get_note(conn, user, incoming.id, include_deleted=True)
    rec = incoming.to_record(existing)
    if existing and rec["updatedAt"] < existing["updatedAt"]:
        return False, existing
    return True, store.upsert_note(conn, user, rec)


@router.get("")
def list_notes(
    q: str | None = None,
    folder: str | None = None,
    tag: str | None = None,
    since: int | None = None,
    include_deleted: bool = False,
    limit: int = Query(500, ge=1, le=2000),
    user: str = Depends(current_user),
):
    with store.db() as conn:
        return store.list_notes(
            conn, user, query=q, folder=folder, tag=tag, since=since,
            include_deleted=include_deleted, limit=limit,
        )


@router.get("/{note_id}")
def get_note(note_id: str, user: str = Depends(current_user)):
    with store.db() as conn:
        note = store.get_note(conn, user, note_id)
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@router.put("/{note_id}")
def put_note(note_id: str, body: NoteIn, user: str = Depends(current_user)):
    if body.id != note_id:
        raise HTTPException(400, "id in body does not match the URL")
    with store.db() as conn:
        ok, note = _apply(conn, user, body)
    if not ok:
        raise HTTPException(409, detail={"message": "Server has a newer version", "server": note})
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: str, user: str = Depends(current_user)):
    with store.db() as conn:
        existing = store.get_note(conn, user, note_id, include_deleted=True)
        if existing is None:
            return
        existing.update(deletedAt=store.now_ms(), updatedAt=store.now_ms(), content=[])
        store.upsert_note(conn, user, existing)


@router.post("/sync")
def sync(body: SyncIn, user: str = Depends(current_user)):
    """Two-way sync in one round trip.

    Pushes the client's notes (each subject to the conflict rule above), then
    returns everything the client does not already have: notes changed on the
    server since `since`, plus the server's copy of any note it refused.
    """
    accepted: list[str] = []
    conflicts: list[dict[str, Any]] = []
    with store.db() as conn:
        for incoming in body.notes:
            ok, note = _apply(conn, user, incoming)
            if ok:
                accepted.append(incoming.id)
            else:
                conflicts.append(note)
        changed = store.list_notes(conn, user, since=body.since, include_deleted=True, limit=2000)
    pushed = set(accepted)
    return {
        "serverTime": store.now_ms(),
        "accepted": accepted,
        "conflicts": conflicts,
        "changes": [n for n in changed if n["id"] not in pushed],
    }


@router.delete("", status_code=200)
def delete_everything(user: str = Depends(current_user)):
    """Permanently remove every note this user has (not a tombstone)."""
    with store.db() as conn:
        return {"deleted": store.delete_all_notes(conn, user)}
