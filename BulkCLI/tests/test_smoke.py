"""Smoke test: proves the harness can boot the app, run signup+login through the
cookie/CSRF flow, and resolve the authenticated user — all on in-memory SQLite
with no live network."""


def test_signup_login_me(authed_client):
    """authed_client has already signed up + logged in. /api/auth/me should
    return the authenticated user resolved from the session cookie."""
    resp = authed_client.get("/api/auth/me")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["email"] == "tester@example.com"
    assert body["name"] == "Test User"
    assert isinstance(body["user_id"], int)


def test_me_requires_auth(client):
    """Without a session cookie, /api/auth/me is rejected with 401."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_csrf_enforced_on_mutating_endpoint(authed_client, mock_meroshare):
    """A mutating endpoint behind require_csrf must reject when the X-CSRF-Token
    header is missing, and get past CSRF when it's present (double-submit)."""
    # Bypass the wrapper to send a POST with NO csrf header -> 403.
    raw = authed_client._c.post("/api/apply", json={"company_id": 1, "kitta": 10})
    assert raw.status_code == 403, raw.text

    # Through the wrapper (auto CSRF header) we clear CSRF; with no accounts the
    # endpoint still returns 200 (a streaming response that applies to 0 users).
    ok = authed_client.post("/api/apply", json={"company_id": 1, "kitta": 10})
    assert ok.status_code == 200, ok.text
