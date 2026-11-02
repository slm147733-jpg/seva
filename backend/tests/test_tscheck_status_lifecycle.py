"""Criterion: attachment status lifecycle — not_started -> seen (admin opens) -> processing
(~60s after seen, automatic) -> generated (admin attaches a file as a reply = receipt;
timer freezes to a Total duration). Verified via direct API, matching what both dashboards poll.
"""
import io
import time


def _create_attachment(user_client, name="tscheck-lifecycle.png"):
    files = {"files": (name, io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 30), "image/png")}
    r = user_client.post("/attachments", files=files)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    return items[0]["id"]


def test_not_started_then_seen_on_admin_open(user_client, admin_client):
    attachment_id = _create_attachment(user_client, "tscheck-lifecycle-seen.png")

    listing = user_client.get("/attachments").json()
    items = listing["items"] if isinstance(listing, dict) else listing
    mine = [a for a in items if a["id"] == attachment_id][0]
    assert mine["status"] == "not_started"

    r = admin_client.get(f"/attachments/{attachment_id}")
    assert r.status_code == 200, r.text
    assert r.json()["attachment"]["status"] == "seen"

    # user side reflects it too (no admin-only visibility quirk)
    listing2 = user_client.get("/attachments").json()
    items2 = listing2["items"] if isinstance(listing2, dict) else listing2
    mine2 = [a for a in items2 if a["id"] == attachment_id][0]
    assert mine2["status"] == "seen"


def test_processing_after_60s_then_generated_on_receipt(user_client, admin_client):
    attachment_id = _create_attachment(user_client, "tscheck-lifecycle-full.png")

    r = admin_client.get(f"/attachments/{attachment_id}")
    assert r.status_code == 200, r.text
    att = r.json()["attachment"]
    assert att["status"] == "seen"
    seen_at = att["seen_at"]
    assert seen_at

    # poll until processing kicks in (auto ~60s after seen), cap wait at 75s
    deadline = time.time() + 75
    status = att["status"]
    while time.time() < deadline and status != "processing":
        time.sleep(3)
        att = admin_client.get(f"/attachments/{attachment_id}").json()["attachment"]
        status = att["status"]
    assert status == "processing", f"never transitioned to processing: {att}"
    assert att["processing_at"]

    # admin attaches a receipt file as a reply -> status becomes generated, timer freezes
    files = {"file": ("tscheck-receipt.pdf", io.BytesIO(b"%PDF-1.4\n" + b"0" * 20), "application/pdf")}
    mr = admin_client.post(
        f"/attachments/{attachment_id}/messages", data={"text": "Receipt attached"}, files=files
    )
    assert mr.status_code == 201, mr.text

    final = admin_client.get(f"/attachments/{attachment_id}").json()["attachment"]
    assert final["status"] == "generated", final
    assert final["generated_at"]

    # user side sees the same final state
    user_final = user_client.get(f"/attachments/{attachment_id}").json()["attachment"]
    assert user_final["status"] == "generated"
    assert user_final["generated_at"] == final["generated_at"]
