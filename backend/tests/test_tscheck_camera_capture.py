"""Criterion: camera capture — POST /api/attachments/camera with mode=pdf creates ONE
application/pdf attachment; mode=images creates one .jpg attachment per photo.
"""
import io

from PIL import Image


def _jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), color=(120, 60, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def test_camera_mode_pdf_creates_single_pdf_attachment(user_client):
    files = [
        ("files", ("tscheck-camera-1.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")),
        ("files", ("tscheck-camera-2.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")),
    ]
    r = user_client.post("/attachments/camera", files=files, data={"mode": "pdf"})
    assert r.status_code in (200, 201), r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    assert len(items) == 1, items
    row = items[0]
    assert row["file"]["content_type"] == "application/pdf"
    assert row["file"]["filename"].startswith("camera-")
    assert row["file"]["filename"].endswith(".pdf")


def test_camera_mode_images_creates_one_attachment_per_photo(user_client):
    files = [
        ("files", ("tscheck-camera-a.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")),
        ("files", ("tscheck-camera-b.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")),
        ("files", ("tscheck-camera-c.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")),
    ]
    r = user_client.post("/attachments/camera", files=files, data={"mode": "images"})
    assert r.status_code in (200, 201), r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    assert len(items) == 3, items
    for row in items:
        assert row["file"]["content_type"] in ("image/jpeg", "image/jpg")
