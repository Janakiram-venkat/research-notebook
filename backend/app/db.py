"""SQLite storage for notes.

A note keeps the same shape the frontend uses (`id`, `title`, `content` as a
list of blocks, `tags`, `folder`, `pinned`, `attachedTo`, epoch-millisecond
`createdAt` / `updatedAt`), so the browser can push and pull notes unchanged.

Deletes are tombstones (`deletedAt` set, body emptied). A hard delete would let a
deleted note come back the next time a device that still has it syncs.
"""

import json
import re
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Iterator

from .config import get_settings

# `user_id` is "" for the single local notebook (NB_AUTH_MODE=local) and the user's
# id in accounts mode. Every query below filters on it, so one user can never read
# or write another's notes.
SCHEMA = """
CREATE TABLE IF NOT EXISTS notes (
    user_id     TEXT NOT NULL DEFAULT '',
    id          TEXT NOT NULL,
    title       TEXT NOT NULL,
    folder      TEXT NOT NULL,
    tags        TEXT NOT NULL,
    pinned      INTEGER NOT NULL DEFAULT 0,
    content     TEXT NOT NULL,
    attached_to TEXT,
    search_text TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    deleted_at  INTEGER,
    PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS notes_updated ON notes(user_id, updated_at);

CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE,
    pw_hash    TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    calls   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
"""


def _migrate(conn: sqlite3.Connection) -> None:
    """Databases made before accounts have `notes(id PRIMARY KEY)` with no user_id.
    Rebuild the table, giving every old note to the local owner ("")."""
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(notes)")]
    if "user_id" in cols:
        return
    conn.executescript(
        """
        ALTER TABLE notes RENAME TO notes_old;
        DROP INDEX IF EXISTS notes_updated;
        """
    )
    conn.executescript(SCHEMA)
    conn.execute(
        """
        INSERT INTO notes (user_id, id, title, folder, tags, pinned, content, attached_to,
                           search_text, created_at, updated_at, deleted_at)
        SELECT '', id, title, folder, tags, pinned, content, attached_to,
               search_text, created_at, updated_at, deleted_at FROM notes_old
        """
    )
    conn.execute("DROP TABLE notes_old")


def connect() -> sqlite3.Connection:
    path = get_settings().db_path
    if path != ":memory:":
        import os

        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    has_notes = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notes'").fetchone()
    if has_notes:
        _migrate(conn)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def now_ms() -> int:
    return int(time.time() * 1000)


def block_text(block: dict[str, Any]) -> str:
    kind = block.get("type")
    if kind == "text":
        return block.get("markdown", "") or ""
    if kind == "code":
        return block.get("code", "") or ""
    if kind == "plot":
        return " ".join(str(block.get(k, "")) for k in ("title", "xLabel", "yLabel"))
    if kind == "mindmap":
        return " ".join(mindmap_lines(block.get("root")))
    if kind == "diagram":
        return block.get("code", "") or ""
    return ""


def mindmap_lines(node: Any, depth: int = 0) -> list[str]:
    """A mind map tree as indented outline lines (root first, unindented)."""
    if not isinstance(node, dict) or depth > 40:
        return []
    text = str(node.get("text") or "").strip() or "…"
    lines = [("  " * (depth - 1) + "- " if depth else "") + text]
    for child in node.get("children") or []:
        lines.extend(mindmap_lines(child, depth + 1))
    return lines


def search_text(title: str, folder: str, tags: list[str], content: list[dict[str, Any]]) -> str:
    parts = [title, folder, *tags, *(block_text(b) for b in content if isinstance(b, dict))]
    return "\n".join(parts).lower()


def row_to_note(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "folder": row["folder"],
        "tags": json.loads(row["tags"]),
        "pinned": bool(row["pinned"]),
        "content": json.loads(row["content"]),
        "attachedTo": json.loads(row["attached_to"]) if row["attached_to"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "deletedAt": row["deleted_at"],
    }


def get_note(conn: sqlite3.Connection, user_id: str, note_id: str, include_deleted: bool = False) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM notes WHERE user_id = ? AND id = ?", (user_id, note_id)).fetchone()
    if row is None or (row["deleted_at"] is not None and not include_deleted):
        return None
    return row_to_note(row)


def list_notes(
    conn: sqlite3.Connection,
    user_id: str,
    *,
    folder: str | None = None,
    tag: str | None = None,
    query: str | None = None,
    since: int | None = None,
    include_deleted: bool = False,
    limit: int = 500,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM notes WHERE user_id = ?"
    args: list[Any] = [user_id]
    if not include_deleted:
        sql += " AND deleted_at IS NULL"
    if folder:
        sql += " AND folder = ?"
        args.append(folder)
    if since is not None:
        sql += " AND updated_at > ?"
        args.append(since)
    for term in (query or "").lower().split():
        sql += " AND search_text LIKE ? ESCAPE '\\'"
        args.append("%" + re.sub(r"([\\%_])", r"\\\1", term) + "%")
    sql += " ORDER BY pinned DESC, updated_at DESC LIMIT ?"
    args.append(limit)
    notes = [row_to_note(r) for r in conn.execute(sql, args)]
    if tag:
        notes = [n for n in notes if tag in n["tags"]]
    return notes


def upsert_note(conn: sqlite3.Connection, user_id: str, note: dict[str, Any]) -> dict[str, Any]:
    """Insert or replace a note exactly as given (the caller decides who wins)."""
    deleted = note.get("deletedAt")
    content = [] if deleted else note["content"]
    conn.execute(
        """
        INSERT INTO notes (user_id, id, title, folder, tags, pinned, content, attached_to,
                           search_text, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, id) DO UPDATE SET
            title=excluded.title, folder=excluded.folder, tags=excluded.tags,
            pinned=excluded.pinned, content=excluded.content,
            attached_to=excluded.attached_to, search_text=excluded.search_text,
            updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
        """,
        (
            user_id,
            note["id"],
            note["title"],
            note["folder"],
            json.dumps(note["tags"]),
            int(bool(note["pinned"])),
            json.dumps(content),
            json.dumps(note["attachedTo"]) if note.get("attachedTo") else None,
            "" if deleted else search_text(note["title"], note["folder"], note["tags"], content),
            note["createdAt"],
            note["updatedAt"],
            deleted,
        ),
    )
    return get_note(conn, user_id, note["id"], include_deleted=True)  # type: ignore[return-value]


def delete_all_notes(conn: sqlite3.Connection, user_id: str) -> int:
    """Hard-delete every note a user owns (the "delete all my data" action)."""
    return conn.execute("DELETE FROM notes WHERE user_id = ?", (user_id,)).rowcount
