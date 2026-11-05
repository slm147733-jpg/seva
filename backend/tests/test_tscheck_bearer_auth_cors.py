"""Backend coverage for: bearer-token auth (for cross-domain static copies) + CORS.

Criterion: POST /api/auth/login returns X-Session-Token header; GET /api/auth/me with
Authorization: Bearer <token> -> 200; without -> 401; CORS preflight from a foreign
Origin allows the authorization header and exposes X-Session-Token.
"""

import os

import httpx

BACKEND_URL = os.environ.get("BACKEND_URL", "https://sevakendra-admin--7tra4y2j.preview.emergentagent.com")
API_URL = f"{BACKEND_URL}/api"

OWNER_MOBILE = "7396406422"
OWNER_PASSWORD = "123456"
FOREIGN_ORIGIN = "http://localhost:5055"  # simulates the Hostinger static copy's origin


def test_login_returns_session_token_header_and_bearer_works():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        r = c.post("/auth/login", json={"mobile": OWNER_MOBILE, "password": OWNER_PASSWORD})
        assert r.status_code == 200, r.text
        token = r.headers.get("x-session-token")
        assert token, f"X-Session-Token header missing; headers={dict(r.headers)}"

        # Bearer token works for /api/auth/me
        me_ok = c.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_ok.status_code == 200, me_ok.text
        body = me_ok.json()
        assert body["mobile"] == OWNER_MOBILE

    # No auth header, fresh client (no cookie jar from login) -> 401
    with httpx.Client(base_url=API_URL, timeout=30.0) as anon:
        me_noauth = anon.get("/auth/me")
        assert me_noauth.status_code == 401, me_noauth.text


def test_cors_preflight_and_expose_headers_for_foreign_origin():
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        # Preflight from a foreign origin (simulating the Hostinger static copy)
        preflight = c.request(
            "OPTIONS",
            "/auth/me",
            headers={
                "Origin": FOREIGN_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )
        assert preflight.status_code in (200, 204), preflight.text
        assert preflight.headers.get("access-control-allow-origin") == FOREIGN_ORIGIN
        allow_headers = (preflight.headers.get("access-control-allow-headers") or "").lower()
        assert "authorization" in allow_headers

        # Actual login request from the foreign origin must expose X-Session-Token
        login = c.post(
            "/auth/login",
            json={"mobile": OWNER_MOBILE, "password": OWNER_PASSWORD},
            headers={"Origin": FOREIGN_ORIGIN},
        )
        assert login.status_code == 200, login.text
        assert login.headers.get("x-session-token")
        expose = (login.headers.get("access-control-expose-headers") or "")
        assert "X-Session-Token" in expose, f"expose-headers missing X-Session-Token: {expose}"
