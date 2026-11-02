"""WhatsApp alerts. No provider is connected yet: every alert is recorded in `whatsapp_alerts`
with status "not_connected" (MOCKED — nothing is actually sent). To go live, implement `_deliver`
for the chosen provider and set WHATSAPP_PROVIDER in backend/.env."""

import logging
import os
import uuid
from datetime import datetime, timezone

from lib.db import db

logger = logging.getLogger(__name__)


async def _deliver(mobile: str, text: str) -> tuple[str, str]:
    provider = os.environ.get("WHATSAPP_PROVIDER", "").strip()
    if not provider:
        return "not_connected", "No WhatsApp provider connected yet — message logged only"
    # Provider hook goes here (Twilio / Meta). Until implemented, fail loudly instead of pretending.
    return "failed", f"Provider '{provider}' is not implemented yet"


async def queue_receipt_alert(user: dict, attachment: dict, app_url: str) -> None:
    name = user.get("name", "")
    text = (
        f"Namaste {name}, your receipt/acknowledgement for \"{attachment['file']['filename']}\" "
        f"is ready at Sevakendra. Log in to download it: {app_url.rstrip('/')}/login"
    )
    try:
        status, detail = await _deliver(user["mobile"], text)
    except Exception as exc:  # never break the receipt upload because of an alert
        logger.exception("whatsapp delivery error")
        status, detail = "failed", str(exc)[:200]
    await db.whatsapp_alerts.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "user_name": name,
            "mobile": user["mobile"],
            "attachment_id": attachment["id"],
            "message": text,
            "status": status,
            "detail": detail,
            "created_at": datetime.now(timezone.utc),
        }
    )
