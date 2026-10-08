"""Accounts, isolation between users, migration, and abuse limits."""

import json
import sqlite3

from app.agent.tools import run_tool
from conftest import note, signup


def test_local_mode_needs_no_login(client):
    assert client.put("/api/notes/a", json=note("a")).status_code == 200
    assert client.get("/api/health").json()["auth"] == "local"
    assert client.post("/api/auth/register", json={"email": "a@b.co", "password": "password123"}).status_code == 404


def test_accounts_mode_requires_a_token(accounts):
    assert accounts.get("/api/notes").status_code == 401
    assert accounts.get("/api/notes", headers={"Authorization": "Bearer junk"}).status_code == 401
    assert accounts.get("/api/health").json()["auth"] == "accounts"


def test_register_login_me(accounts):
    headers = signup(accounts)
    assert accounts.get("/api/auth/me", headers=headers).json()["email"] == "a@example.com"
    assert accounts.post("/api/auth/register", json={"email": "A@Example.com", "password": "password123"}).status_code == 409
    ok = accounts.post("/api/auth/login", json={"email": "a@example.com", "password": "password123"})
    assert ok.status_code == 200
    bad = accounts.post("/api/auth/login", json={"email": "a@example.com", "password": "wrongpassword"})
    assert bad.status_code == 401
    nobody = accounts.post("/api/auth/login", json={"email": "x@example.com", "password": "wrongpassword"})
    assert nobody.json()["detail"] == bad.json()["detail"]


def test_register_validation(accounts):
    assert accounts.post("/api/auth/register", json={"email": "nope", "password": "password123"}).status_code == 422
    assert accounts.post("/api/auth/register", json={"email": "a@b.co", "password": "short"}).status_code == 422


def test_users_cannot_see_each_others_notes(accounts):
    alice = signup(accounts, "alice@example.com")
    bob = signup(accounts, "bob@example.com")
    assert accounts.put("/api/notes/a", json=note("a"), headers=alice).status_code == 200
    assert accounts.get("/api/notes/a", headers=bob).status_code == 404
    assert accounts.get("/api/notes", headers=bob).json() == []
    # The same id for Bob is a separate note, not a conflict with Alice's.
    assert accounts.put("/api/notes/a", json=note("a", title="Bobs"), headers=bob).status_code == 200
    assert accounts.get("/api/notes/a", headers=alice).json()["title"] == "Note a"
    sync = accounts.post("/api/notes/sync", json={"since": 0, "notes": []}, headers=bob).json()
    assert [n["title"] for n in sync["changes"]] == ["Bobs"]


def test_agent_tools_are_scoped_to_the_user(accounts):
    alice = signup(accounts, "alice@example.com")
    accounts.put("/api/notes/a", json=note("a", title="Secret"), headers=alice)
    uid = accounts.get("/api/auth/me", headers=alice).json()["id"]
    assert "Secret" in run_tool("list_notes", {}, uid)[0]
    assert json.loads(run_tool("list_notes", {}, "someone-else")[0]) == []
    assert run_tool("read_note", {"note_id": "a"}, "someone-else")[1] is True
    assert run_tool("append_to_note", {"note_id": "a", "markdown": "x"}, "someone-else")[1] is True


def test_first_user_inherits_pre_accounts_notes(client, monkeypatch):
    assert client.put("/api/notes/old", json=note("old")).status_code == 200  # local mode
    monkeypatch.setenv("NB_AUTH_MODE", "accounts")
    first = signup(client, "first@example.com")
    second = signup(client, "second@example.com")
    assert client.get("/api/notes/old", headers=first).status_code == 200
    assert client.get("/api/notes/old", headers=second).status_code == 404


def test_old_database_is_migrated(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    conn.executescript(
        """CREATE TABLE notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL, tags TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL, attached_to TEXT, search_text TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER);
        INSERT INTO notes VALUES ('n1','Kept','General','[]',0,'[]',NULL,'kept',1,2,NULL);"""
    )
    conn.commit()
    conn.close()
    monkeypatch.setenv("NB_DB_PATH", str(path))
    monkeypatch.delenv("NB_AUTH_MODE", raising=False)
    from fastapi.testclient import TestClient
    from app.main import create_app

    assert TestClient(create_app()).get("/api/notes/n1").json()["title"] == "Kept"


def test_delete_all_and_delete_account(accounts):
    alice = signup(accounts, "alice@example.com")
    bob = signup(accounts, "bob@example.com")
    accounts.put("/api/notes/a", json=note("a"), headers=alice)
    accounts.put("/api/notes/b", json=note("b"), headers=bob)
    assert accounts.delete("/api/notes", headers=alice).json() == {"deleted": 1}
    assert accounts.get("/api/notes", headers=alice).json() == []
    assert len(accounts.get("/api/notes", headers=bob).json()) == 1
    assert accounts.delete("/api/auth/me", headers=bob).status_code == 200
    assert accounts.get("/api/auth/me", headers=bob).status_code == 401


def test_sign_ups_can_be_closed(accounts, monkeypatch):
    monkeypatch.setenv("NB_ALLOW_REGISTRATION", "0")
    assert accounts.post("/api/auth/register", json={"email": "a@b.co", "password": "password123"}).status_code == 403


def test_auth_endpoints_are_rate_limited(accounts, monkeypatch):
    monkeypatch.setenv("NB_RATE_PER_MINUTE", "3")
    codes = [accounts.post("/api/auth/login", json={"email": "a@b.co", "password": "password123"}).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]


def test_daily_agent_budget(accounts, monkeypatch):
    monkeypatch.setenv("NB_AGENT_DAILY_CALLS", "2")
    headers = signup(accounts)
    body = {"messages": [{"role": "user", "content": "hi"}]}
    # Without a key the stream itself reports an error, but each call is still counted.
    for _ in range(2):
        assert accounts.post("/api/agents/assistant/chat", json=body, headers=headers).status_code == 200
    res = accounts.post("/api/agents/assistant/chat", json=body, headers=headers)
    assert res.status_code == 429 and "AI requests" in res.json()["detail"]
    # A visitor's own key is not counted against the budget.
    own = accounts.post("/api/agents/assistant/chat", json=body, headers={**headers, "X-Anthropic-Key": "sk-test"})
    assert own.status_code == 200


def test_assistant_is_off_until_a_key_exists(accounts, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("NB_AGENT_DAILY_CALLS", "1")
    headers = signup(accounts)
    body = {"messages": [{"role": "user", "content": "hi"}]}
    assert accounts.get("/api/health").json()["ai"] is False
    for _ in range(3):  # an unconfigured server never spends the user's daily budget
        res = accounts.post("/api/agents/assistant/chat", json=body, headers=headers)
        assert res.status_code == 503 and "not set up" in res.json()["detail"]
    own = accounts.post("/api/agents/assistant/chat", json=body, headers={**headers, "X-Anthropic-Key": "sk-test"})
    assert own.status_code == 200  # a visitor's own key still works


def test_hsts_only_over_https(client):
    assert "strict-transport-security" not in client.get("/api/health").headers
    assert "strict-transport-security" in client.get("/api/health", headers={"X-Forwarded-Proto": "https"}).headers
