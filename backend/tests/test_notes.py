from conftest import note


def test_put_get_list_roundtrip(client):
    assert client.put("/api/notes/a", json=note("a")).status_code == 200
    got = client.get("/api/notes/a").json()
    assert got["title"] == "Note a" and got["content"][0]["markdown"] == "hello"
    assert [n["id"] for n in client.get("/api/notes").json()] == ["a"]


def test_search_requires_every_word_and_escapes_wildcards(client):
    client.put("/api/notes/a", json=note("a", title="Bayes rule", content=[{"id": "x", "type": "text", "markdown": "priors 100% matter"}]))
    client.put("/api/notes/b", json=note("b", title="Other"))
    ids = lambda q: [n["id"] for n in client.get("/api/notes", params={"q": q}).json()]
    assert ids("bayes priors") == ["a"]
    assert ids("bayes zzz") == []
    assert ids("%") == ["a"]  # literal percent sign, not a wildcard matching everything
    assert ids("_") == []


def test_older_write_is_refused_with_the_server_copy(client):
    client.put("/api/notes/a", json=note("a", title="new", updatedAt=2000))
    r = client.put("/api/notes/a", json=note("a", title="stale", updatedAt=1500))
    assert r.status_code == 409
    assert r.json()["detail"]["server"]["title"] == "new"
    assert client.get("/api/notes/a").json()["title"] == "new"


def test_delete_is_a_tombstone_and_empties_the_body(client):
    client.put("/api/notes/a", json=note("a"))
    assert client.delete("/api/notes/a").status_code == 204
    assert client.get("/api/notes/a").status_code == 404
    assert client.get("/api/notes").json() == []
    dead = client.get("/api/notes", params={"include_deleted": True}).json()
    assert dead[0]["deletedAt"] and dead[0]["content"] == []


def test_a_stale_client_cannot_resurrect_a_deleted_note(client):
    client.put("/api/notes/a", json=note("a", updatedAt=1000))
    client.delete("/api/notes/a")
    r = client.put("/api/notes/a", json=note("a", updatedAt=1000))
    assert r.status_code == 409


def test_sync_pushes_pulls_and_reports_conflicts(client):
    client.put("/api/notes/server", json=note("server", updatedAt=5000))
    client.put("/api/notes/both", json=note("both", title="server wins", updatedAt=9000))
    r = client.post("/api/notes/sync", json={"since": 0, "notes": [
        note("local", updatedAt=3000),
        note("both", title="stale local", updatedAt=2000),
    ]}).json()
    assert r["accepted"] == ["local"]
    assert [c["id"] for c in r["conflicts"]] == ["both"]
    assert sorted(n["id"] for n in r["changes"]) == ["both", "server"]  # pushed notes are not echoed back
    assert client.get("/api/notes/local").status_code == 200


def test_id_mismatch_is_rejected(client):
    assert client.put("/api/notes/a", json=note("b")).status_code == 400


def test_token_auth_when_configured(client, monkeypatch):
    monkeypatch.setenv("NB_API_TOKEN", "s3cret")
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/notes").status_code == 401
    assert client.get("/api/notes", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/notes", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_mind_maps_and_diagrams_are_searchable_and_readable(client):
    from app.agent.tools import run_tool

    root = {"id": "r", "text": "Photosynthesis", "children": [{"id": "c", "text": "Chlorophyll", "children": []}]}
    body = note("v", content=[
        {"id": "b1", "type": "mindmap", "root": root},
        {"id": "b2", "type": "diagram", "code": "flowchart LR\n  Light --> Sugar"},
    ])
    assert client.put("/api/notes/v", json=body).status_code == 200
    assert [n["id"] for n in client.get("/api/notes", params={"q": "chlorophyll"}).json()] == ["v"]
    assert [n["id"] for n in client.get("/api/notes", params={"q": "sugar"}).json()] == ["v"]
    text = run_tool("read_note", {"note_id": "v"})[0]
    assert "Photosynthesis" in text and "- Chlorophyll" in text and "```mermaid" in text
