"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os

import httpx
import pytest
import pytest_asyncio

# sk_session is a Secure cookie; httpx (like browsers) won't send it back over plain
# http://localhost, so auth-dependent tests must talk to the public https origin.
BACKEND_URL = os.environ.get("BACKEND_URL", "https://sevakendra-admin--7tra4y2j.preview.emergentagent.com")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---

ADMIN_MOBILE = "7396406422"
ADMIN_PASSWORD = "Raju@14773"
USER_MOBILE = "9000000001"
USER_PASSWORD = "test123"


@pytest.fixture
def admin_client():
    """httpx client authenticated as the seeded admin (Raju)."""
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"mobile": ADMIN_MOBILE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    yield c
    c.close()


@pytest.fixture
def user_client():
    """httpx client authenticated as the seeded Test User."""
    c = httpx.Client(base_url=API_URL, timeout=30.0)
    r = c.post("/auth/login", json={"mobile": USER_MOBILE, "password": USER_PASSWORD})
    assert r.status_code == 200, r.text
    yield c
    c.close()


def unique_mobile() -> str:
    """Generate a syntactically-valid unique 10-digit mobile starting 8xxxxxxxxx for throwaway users."""
    import random

    return "8" + "".join(str(random.randint(0, 9)) for _ in range(9))
