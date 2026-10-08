# Backend

FastAPI + SQLite. Stores notes and runs the agents.

    cd backend
    python -m venv .venv
    .venv\Scripts\pip install -r requirements.txt
    copy .env.example .env          # then put your ANTHROPIC_API_KEY in it
    .venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
    .venv\Scripts\python -m pytest

Then `npm run dev` in the repo root. Vite proxies `/api` to port 8000. The frontend works without
the backend; it syncs and enables the Agents panel when it finds one.

## API
| | |
|---|---|
| `GET /api/health` | liveness, note count, model |
| `GET /api/notes` | `?q=&folder=&tag=&since=&include_deleted=` |
| `GET/PUT/DELETE /api/notes/{id}` | PUT is an upsert; an older `updatedAt` than the server's returns 409 with the server copy; DELETE is a tombstone |
| `POST /api/notes/sync` | `{since, notes}` -> `{accepted, conflicts, changes, serverTime}` |
| `GET /api/agents` | the available agents |
| `POST /api/agents/{key}/chat` | `{messages, focus_note_id?}`, answered as server-sent events |

Chat events: `text`, `thinking`, `tool_use`, `tool_result` (with `changed` note ids), `done`, `error`.

## Agents
`app/agent/profiles.py`: assistant, research, study, decision. Each is a system prompt over the same tools
(`app/agent/tools.py`): list, search, read, find related, create note, append to note. There is no delete
and no overwrite, so a bad run can add text but cannot lose any. A run is capped at `NB_AGENT_MAX_STEPS`
tool rounds.

To add an agent, add a profile. To add a capability, add a tool definition and a handler.

## Config (env or `backend/.env`)
`ANTHROPIC_API_KEY`, `NB_AGENT_MODEL` (default `claude-opus-5-5`), `NB_AGENT_MAX_STEPS` (12),
`NB_DB_PATH`, `NB_CORS_ORIGINS`, and `NB_API_TOKEN` (when set, `/api` calls need `Authorization: Bearer <token>`;
the browser reads it from `localStorage['nb.apiToken']`).

## Accounts and limits
`NB_AUTH_MODE=accounts` turns on sign-in: `POST /api/auth/register|login`, `GET /api/auth/me`, `DELETE /api/auth/me`
(deletes the account and its notes), `DELETE /api/notes` (deletes all of a user's notes). Passwords are scrypt-hashed;
tokens are HMAC-signed and last `NB_TOKEN_DAYS`. Every query is filtered by user, including the agents' tools.
The first account inherits any notes saved before accounts were on. In the default `local` mode nothing changes.
Assistant requests are capped per user per day (`NB_AGENT_DAILY_CALLS`) and per minute (`NB_RATE_PER_MINUTE`); a visitor's
own key sent as `X-Anthropic-Key` is used for that request only, never stored, and is not counted.
When `../dist` exists the API also serves the built frontend, with a CSP and security headers.

## Not done yet
- Rate limits are in memory, so they assume one server process. There is no password reset or email verification.
- Notes sync as whole notes, last write wins by `updatedAt` (older writes are refused, not merged).
- Refusal fallbacks (`fallbacks` beta parameter) are not enabled; a refusal is reported as an error.
- The note open in the editor does not hot-reload when an agent appends to it; the panel offers a reload.
