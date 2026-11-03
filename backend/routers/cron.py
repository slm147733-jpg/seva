"""Platform cron: daily reminder to users whose requested documents are still missing."""

import hmac
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from lib.db import db
from models.attachment import MessageOut
from models.user import Ok

router = APIRouter(prefix="/cron", tags=["cron"])
log = logging.getLogger(__name__)
REMIND_AFTER = timedelta(days=1)


def _auth(request: Request) -> None:
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    header = request.headers.get("Authorization", "")
    token = header[7:] if header.startswith("Bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def send_missing_doc_reminders() -> int:
    """Post one reminder per file per day while requested documents are still outstanding."""
    now = datetime.now(timezone.utc)
    cutoff = now - REMIND_AFTER
    sent = 0
    cursor = db.attachments.find({
        "missing_documents.0": {"$exists": True},
        "generated_at": None, "rejected_at": None,
        "missing_requested_at": {"$lte": cutoff},
        "$or": [{"missing_reminded_at": None}, {"missing_reminded_at": {"$lte": cutoff}}],
    }, {"_id": 0})
    async for doc in cursor:
        pending = [d for d in doc.get("missing_documents") or [] if d not in set(doc.get("missing_resolved") or [])]
        if not pending:
            continue
        # Claim first so overlapping runs never double-remind.
        claimed = await db.attachments.update_one(
            {"id": doc["id"], "missing_reminded_at": doc.get("missing_reminded_at")},
            {"$set": {"missing_reminded_at": now, "last_event_at": now, "last_event_role": "admin", "unread_user": True,
                      "last_event_text": f"Reminder: {len(pending)} document{'s' if len(pending) != 1 else ''} still needed"},
             "$inc": {"message_count": 1}},
        )
        if claimed.modified_count == 0:
            continue
        text = "Reminder: we're still waiting for these documents to continue your application:\n" + "\n".join(f"• {d}" for d in pending)
        msg = MessageOut(id=str(uuid.uuid4()), attachment_id=doc["id"], sender_id="system", sender_name="Sevakendra",
                         sender_role="admin", text=text, file=None, is_receipt=False, created_at=now)
        await db.attachment_messages.insert_one(msg.model_dump())
        sent += 1
    return sent


async def _run(run_id: str) -> None:
    try:
        n = await send_missing_doc_reminders()
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "done", "sent": n}})
    except Exception:
        log.exception("missing-doc reminder run failed")
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"status": "failed"}})


@router.post("/missing-docs-reminder", response_model=Ok, status_code=202)
async def missing_docs_reminder(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _auth(request)
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid body")
    run_id = request.headers.get("X-Webhook-Id") or (body or {}).get("run_id") or str(uuid.uuid4())
    res = await db.cron_runs.update_one(
        {"run_id": run_id}, {"$setOnInsert": {"run_id": run_id, "job": "missing-docs-reminder", "status": "queued",
                                               "created_at": datetime.now(timezone.utc)}}, upsert=True,
    )
    if res.upserted_id is not None:  # duplicate deliveries are acked without re-running
        background.add_task(_run, run_id)
    return Ok(ok=True)
