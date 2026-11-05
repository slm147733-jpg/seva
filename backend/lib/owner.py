"""Fixed owner admin login. Enforced on every backend start (preview and published) so it always works."""

import uuid
from datetime import datetime, timezone

from lib.auth import hash_password, verify_password
from lib.db import db

OWNER_MOBILE = "7396406422"
OWNER_PASSWORD = "123456"


async def ensure_owner_admin() -> None:
    doc = await db.users.find_one({"mobile": OWNER_MOBILE}, {"_id": 0, "password_hash": 1})
    changes: dict = {"role": "admin", "is_active": True}
    if not doc or not verify_password(OWNER_PASSWORD, doc.get("password_hash") or ""):
        changes["password_hash"] = hash_password(OWNER_PASSWORD)
        await db.sessions.delete_many({"user_id": (await db.users.find_one({"mobile": OWNER_MOBILE}, {"id": 1}) or {}).get("id", "-")})
    await db.users.update_one(
        {"mobile": OWNER_MOBILE},
        {"$set": changes, "$setOnInsert": {"id": str(uuid.uuid4()), "name": "Raju", "created_at": datetime.now(timezone.utc),
                                            "last_login": None, "service_ids": [], "wallet_balance": 0}},
        upsert=True,
    )
