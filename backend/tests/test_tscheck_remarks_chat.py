"""Criterion: remarks thread under an attachment — both user and admin can post text
and/or a file; both see all messages; a USER file reply does NOT flip status to generated.
"""
import io


def _create_attachment(user_client, name="tscheck-remarks.png"):
    files = {"files": (name, io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 30), "image/png")}
    r = user_client.post("/attachments", files=files)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    items = body["items"] if isinstance(body, dict) and "items" in body else body
    return items[0]["id"]


def test_both_sides_can_post_and_see_messages(user_client, admin_client):
    attachment_id = _create_attachment(user_client)

    # admin opens first so it isn't "not_started" when it replies
    admin_client.get(f"/attachments/{attachment_id}")

    r1 = user_client.post(f"/attachments/{attachment_id}/messages", data={"text": "tscheck: hello from user"})
    assert r1.status_code == 201, r1.text

    r2 = admin_client.post(f"/attachments/{attachment_id}/messages", data={"text": "tscheck: hello from admin"})
    assert r2.status_code == 201, r2.text

    detail_user = user_client.get(f"/attachments/{attachment_id}").json()
    texts_user = [m["text"] for m in detail_user["messages"]]
    assert "tscheck: hello from user" in texts_user
    assert "tscheck: hello from admin" in texts_user

    detail_admin = admin_client.get(f"/attachments/{attachment_id}").json()
    texts_admin = [m["text"] for m in detail_admin["messages"]]
    assert "tscheck: hello from user" in texts_admin
    assert "tscheck: hello from admin" in texts_admin


def test_user_file_reply_does_not_set_generated(user_client, admin_client):
    attachment_id = _create_attachment(user_client, "tscheck-remarks-userfile.png")
    admin_client.get(f"/attachments/{attachment_id}")  # -> seen

    files = {"file": ("tscheck-extra.png", io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 20), "image/png")}
    r = user_client.post(f"/attachments/{attachment_id}/messages", data={"text": "extra doc"}, files=files)
    assert r.status_code == 201, r.text

    detail = admin_client.get(f"/attachments/{attachment_id}").json()
    assert detail["attachment"]["status"] != "generated"
    assert detail["attachment"]["status"] == "seen"
    sent_msg = [m for m in detail["messages"] if m["text"] == "extra doc"][0]
    assert sent_msg["is_receipt"] is False
