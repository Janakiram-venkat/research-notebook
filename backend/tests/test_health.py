"""Smoke tests: the endpoint the deploy workflow and uptime checks rely on."""


def test_health_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["notes"] == 0
    assert body["auth"] == "local"


def test_health_reports_accounts_mode(accounts):
    res = accounts.get("/api/health")
    assert res.status_code == 200
    assert res.json()["auth"] == "accounts"


def test_health_needs_no_sign_in(accounts):
    # Uptime checks call this without a token, even when accounts are required.
    assert accounts.get("/api/health").status_code == 200
    assert accounts.get("/api/notes").status_code == 401
