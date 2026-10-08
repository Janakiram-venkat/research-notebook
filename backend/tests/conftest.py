import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("NB_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.delenv("NB_API_TOKEN", raising=False)
    monkeypatch.delenv("NB_AUTH_MODE", raising=False)
    monkeypatch.setenv("NB_SECRET_KEY", "test-secret")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-server")
    from app import limits

    limits.reset()
    from app.main import create_app

    return TestClient(create_app())


@pytest.fixture()
def accounts(client, monkeypatch):
    """The same app with sign-in required."""
    monkeypatch.setenv("NB_AUTH_MODE", "accounts")
    return client


def signup(client, email="a@example.com", password="password123"):
    res = client.post("/api/auth/register", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def note(id, **kw):
    base = {"id": id, "title": f"Note {id}", "folder": "General", "tags": [], "pinned": False,
            "content": [{"id": "b1", "type": "text", "markdown": "hello"}],
            "createdAt": 1000, "updatedAt": 1000}
    base.update(kw)
    return base
