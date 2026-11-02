"""Criterion: access control on files/attachments.
- A user cannot read another user's attachment (404) or file (404).
- Anonymous access is rejected (401).
- Unicode filenames download fine (200) for the owner/admin.
"""
import io

import httpx


def test_cross_user_attachment_is_404(user_client, admin_client, backend_url):
    # admin creates a second throwaway user and we create an attachment owned by Test User (user_client),
    # then verify the OTHER user cannot see it.
    mobile = "8222222222"
    r = admin_client.post(
        "/admin/users",
        json={"name": "tscheck-access-other", "mobile": mobile, "password": "Other@1234", "role": "user"},
    )
    assert r.status_code in (200, 201, 400, 409), r.text  # already exists from a previous run

    other = httpx.Client(base_url=f"{backend_url}/api", timeout=30.0)
    try:
        lr = other.post("/auth/login", json={"mobile": mobile, "password": "Other@1234"})
        assert lr.status_code == 200, lr.text

        files = {"files": ("tscheck-access-owner.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 20), "image/png")}
        cr = user_client.post("/attachments", files=files)
        assert cr.status_code in (200, 201), cr.text
        body = cr.json()
        items = body["items"] if isinstance(body, dict) and "items" in body else body
        attachment_id = items[0]["id"]
        file_id = items[0]["file"]["file_id"]

        r2 = other.get(f"/attachments/{attachment_id}")
        assert r2.status_code == 404, r2.text

        r3 = other.get(f"/files/{file_id}")
        assert r3.status_code == 404, r3.text
    finally:
        other.close()


def test_anonymous_gets_401(user_client, backend_url):
    files = {"files": ("tscheck-access-anon.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 20), "image/png")}
    cr = user_client.post("/attachments", files=files)
    assert cr.status_code in (200, 201), cr.text
    body = cr.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    attachment_id = items[0]["id"]
    file_id = items[0]["file"]["file_id"]

    anon = httpx.Client(base_url=f"{backend_url}/api", timeout=30.0)
    try:
        r1 = anon.get(f"/attachments/{attachment_id}")
        assert r1.status_code == 401, r1.text
        r2 = anon.get(f"/files/{file_id}")
        assert r2.status_code == 401, r2.text
        r3 = anon.get("/attachments")
        assert r3.status_code == 401, r3.text
    finally:
        anon.close()


def test_unicode_filename_downloads_fine(user_client):
    name = "tscheck-unicode-\u20b9-\U0001f4c4.png"
    files = {"files": (name, io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 20), "image/png")}
    cr = user_client.post("/attachments", files=files)
    assert cr.status_code in (200, 201), cr.text
    body = cr.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    file_id = items[0]["file"]["file_id"]

    r = user_client.get(f"/files/{file_id}?download=true")
    assert r.status_code == 200, r.text
