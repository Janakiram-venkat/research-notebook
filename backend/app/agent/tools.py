"""Tools the agents can call. They act on the same SQLite store the app uses.

Deliberately no delete and no overwrite: an agent can read, search, create notes
and append to them, so the worst a confused run can do is add text you can
remove. Editing or deleting existing words stays a human action.
"""

import json
import re
import uuid
from typing import Any, Callable

from .. import db as store

WIKI_LINK = re.compile(r"\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]")
MAX_READ_CHARS = 20_000

TOOL_DEFS: list[dict[str, Any]] = [
    {
        "name": "list_notes",
        "description": "List the user's notes, newest first (pinned first). Use to see what exists before searching.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "folder": {"type": "string", "description": "Only notes in this folder."},
                "tag": {"type": "string", "description": "Only notes with this tag."},
                "limit": {"type": "integer", "description": "Max notes to return (default 30)."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "search_notes",
        "description": "Full-text search over note titles, folders, tags, text and code. Every word must match.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer", "description": "Max results (default 10)."},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    {
        "name": "read_note",
        "description": "Read one note in full as Markdown (text, code with its last output, plots).",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"note_id": {"type": "string"}},
            "required": ["note_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "find_related",
        "description": (
            "Find notes connected to a note: notes that link to it, notes it links to "
            "([[wiki links]]), and notes sharing its tags."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"note_id": {"type": "string"}},
            "required": ["note_id"],
            "additionalProperties": False,
        },
    },
    {
        "name": "create_note",
        "description": (
            "Create a new note. `markdown` is the body (headings, lists, $math$, [[Note title]] links). "
            "Prefer this over appending when the content is a new topic."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "markdown": {"type": "string"},
                "folder": {"type": "string", "description": "Folder name; default General."},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["title", "markdown"],
            "additionalProperties": False,
        },
    },
    {
        "name": "append_to_note",
        "description": "Add Markdown to the end of an existing note. Never changes or removes existing content.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"note_id": {"type": "string"}, "markdown": {"type": "string"}},
            "required": ["note_id", "markdown"],
            "additionalProperties": False,
        },
    },
]


class ToolError(Exception):
    """A problem the model can read and recover from (bad id, empty text)."""


class ToolResult:
    def __init__(self, data: Any, summary: str, changed: list[str] | None = None):
        self.data = data
        self.summary = summary
        self.changed = changed or []


def note_to_markdown(note: dict[str, Any]) -> str:
    out = [f"# {note['title']}", f"_folder: {note['folder']} · tags: {', '.join(note['tags']) or 'none'}_"]
    for block in note["content"]:
        kind = block.get("type")
        if kind == "text":
            out.append(block.get("markdown", ""))
        elif kind == "code":
            out.append(f"```{block.get('framework', 'python')}\n{block.get('code', '')}\n```")
            output = (block.get("lastResult") or {}).get("output")
            if output:
                out.append(f"Output:\n```\n{output}\n```")
        elif kind == "plot":
            out.append(f"[plot {block.get('title', '')}]\n{block.get('data', '')}")
        elif kind == "mindmap":
            out.append("[mind map]\n" + "\n".join(store.mindmap_lines(block.get("root"))))
        elif kind == "diagram":
            out.append(f"```mermaid\n{block.get('code', '')}\n```")
    return "\n\n".join(out)


def _brief(note: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": note["id"],
        "title": note["title"],
        "folder": note["folder"],
        "tags": note["tags"],
        "updatedAt": note["updatedAt"],
    }


def _links(note: dict[str, Any]) -> list[tuple[str | None, str]]:
    """`[[id|Label]]` -> (id, label); `[[Label]]` -> (None, label)."""
    found: list[tuple[str | None, str]] = []
    for block in note["content"]:
        if block.get("type") != "text":
            continue
        for first, second in WIKI_LINK.findall(block.get("markdown", "")):
            found.append((first, second) if second else (None, first))
    return found


def _limit(value: Any, default: int, cap: int = 100) -> int:
    return max(1, min(int(value), cap)) if isinstance(value, int) else default


def _require_note(conn, user: str, note_id: str) -> dict[str, Any]:
    note = store.get_note(conn, user, note_id)
    if note is None:
        raise ToolError(f"No note with id {note_id!r}. Use list_notes or search_notes to find ids.")
    return note


def list_notes(conn, user: str, args: dict[str, Any]) -> ToolResult:
    notes = store.list_notes(
        conn, user, folder=args.get("folder"), tag=args.get("tag"), limit=_limit(args.get("limit"), 30)
    )
    return ToolResult([_brief(n) for n in notes], f"{len(notes)} notes")


def search_notes(conn, user: str, args: dict[str, Any]) -> ToolResult:
    query = (args.get("query") or "").strip()
    if not query:
        raise ToolError("query is empty")
    notes = store.list_notes(conn, user, query=query, limit=_limit(args.get("limit"), 10, 50))
    return ToolResult([_brief(n) for n in notes], f"{len(notes)} matches for {query!r}")


def read_note(conn, user: str, args: dict[str, Any]) -> ToolResult:
    note = _require_note(conn, user, args.get("note_id", ""))
    text = note_to_markdown(note)
    truncated = len(text) > MAX_READ_CHARS
    if truncated:
        text = text[:MAX_READ_CHARS] + "\n\n[truncated]"
    return ToolResult(text, f"read {note['title']!r}")


def find_related(conn, user: str, args: dict[str, Any]) -> ToolResult:
    note = _require_note(conn, user, args.get("note_id", ""))
    everything = store.list_notes(conn, user, limit=2000)
    by_title = {n["title"].lower(): n for n in everything}
    by_id = {n["id"]: n for n in everything}

    links_to: dict[str, dict[str, Any]] = {}
    for target_id, label in _links(note):
        target = by_id.get(target_id) if target_id else by_title.get(label.lower())
        if target and target["id"] != note["id"]:
            links_to[target["id"]] = target

    linked_from = [
        n for n in everything
        if n["id"] != note["id"]
        and any((tid == note["id"]) or (tid is None and label.lower() == note["title"].lower())
                for tid, label in _links(n))
    ]
    shared = [
        n for n in everything
        if n["id"] != note["id"] and set(n["tags"]) & set(note["tags"])
    ]
    data = {
        "links_to": [_brief(n) for n in links_to.values()],
        "linked_from": [_brief(n) for n in linked_from],
        "shares_tags": [_brief(n) for n in shared],
    }
    total = sum(len(v) for v in data.values())
    return ToolResult(data, f"{total} connections")


def _new_block_id() -> str:
    return "b" + uuid.uuid4().hex[:12]


def create_note(conn, user: str, args: dict[str, Any]) -> ToolResult:
    title = (args.get("title") or "").strip()
    markdown = (args.get("markdown") or "").strip()
    if not title or not markdown:
        raise ToolError("title and markdown are both required")
    now = store.now_ms()
    note = store.upsert_note(conn, user, {
        "id": "note" + uuid.uuid4().hex[:12],
        "title": title[:200],
        "folder": (args.get("folder") or "General").strip() or "General",
        "tags": [t.strip() for t in (args.get("tags") or []) if isinstance(t, str) and t.strip()],
        "pinned": False,
        "content": [{"id": _new_block_id(), "type": "text", "markdown": markdown}],
        "attachedTo": None,
        "createdAt": now,
        "updatedAt": now,
        "deletedAt": None,
    })
    return ToolResult({"id": note["id"], "title": note["title"]}, f"created {note['title']!r}", [note["id"]])


def append_to_note(conn, user: str, args: dict[str, Any]) -> ToolResult:
    markdown = (args.get("markdown") or "").strip()
    if not markdown:
        raise ToolError("markdown is empty")
    note = _require_note(conn, user, args.get("note_id", ""))
    note["content"].append({"id": _new_block_id(), "type": "text", "markdown": markdown})
    note["updatedAt"] = store.now_ms()
    store.upsert_note(conn, user, note)
    return ToolResult({"id": note["id"]}, f"appended to {note['title']!r}", [note["id"]])


HANDLERS: dict[str, Callable[[Any, str, dict[str, Any]], ToolResult]] = {
    "list_notes": list_notes,
    "search_notes": search_notes,
    "read_note": read_note,
    "find_related": find_related,
    "create_note": create_note,
    "append_to_note": append_to_note,
}


def run_tool(name: str, args: dict[str, Any], user_id: str = "") -> tuple[str, bool, ToolResult | None]:
    """Execute a tool. Returns (content for the model, is_error, result)."""
    handler = HANDLERS.get(name)
    if handler is None:
        return f"Unknown tool {name!r}", True, None
    try:
        with store.db() as conn:
            result = handler(conn, user_id, args if isinstance(args, dict) else {})
    except ToolError as err:
        return str(err), True, None
    except Exception as err:  # a bug in a tool must not kill the whole run
        return f"Tool failed: {err}", True, None
    content = result.data if isinstance(result.data, str) else json.dumps(result.data)
    return content, False, result
