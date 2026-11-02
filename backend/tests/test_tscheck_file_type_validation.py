"""Criterion: uploading via POST /api/attachments rejects .txt and >10MB files;
valid PDF/JPG/JPEG/PNG files become their own 'not_started' row.
"""
import io


def test_valid_png_upload_creates_not_started_row(user_client):
    files = {"files": ("tscheck-filetype-valid.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 50), "image/png")}
    r = user_client.post("/attachments", files=files)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    assert len(items) == 1
    row = items[0]
    assert row["file"]["filename"] == "tscheck-filetype-valid.png"
    assert row["status"] == "not_started"


def test_txt_file_rejected(user_client):
    files = {"files": ("tscheck-filetype-bad.txt", io.BytesIO(b"hello world"), "text/plain")}
    r = user_client.post("/attachments", files=files)
    assert r.status_code == 400, r.text


def test_oversize_file_rejected(user_client):
    big = b"0" * (10 * 1024 * 1024 + 1024)  # just over 10MB
    files = {"files": ("tscheck-filetype-big.png", io.BytesIO(big), "image/png")}
    r = user_client.post("/attachments", files=files)
    assert r.status_code == 400, r.text


def test_admin_cannot_start_new_attachment(admin_client):
    """Spec deviation: admins cannot create their own attachment (POST returns 403)."""
    files = {"files": ("tscheck-filetype-admin.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 10), "image/png")}
    r = admin_client.post("/attachments", files=files)
    assert r.status_code == 403, r.text
