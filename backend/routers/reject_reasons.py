"""Admin-editable one-tap reasons shown in the Reject dialog."""

from fastapi import APIRouter, Depends

from lib.auth import require_admin
from lib.db import db
from models.attachment import RejectReasons

router = APIRouter(prefix="/admin/reject-reasons", tags=["reject-reasons"], dependencies=[Depends(require_admin)])

DEFAULT_REASONS = [
    "Blurry photo", "Wrong document", "Document incomplete",
    "Details don't match", "Document expired", "Wrong service selected",
]


@router.get("", response_model=RejectReasons)
async def get_reasons():
    doc = await db.settings.find_one({"key": "reject_reasons"}, {"_id": 0})
    return RejectReasons(reasons=doc["reasons"] if doc else DEFAULT_REASONS)


@router.put("", response_model=RejectReasons)
async def put_reasons(body: RejectReasons):
    clean = list(dict.fromkeys(r.strip()[:80] for r in body.reasons if r and r.strip()))
    await db.settings.update_one({"key": "reject_reasons"}, {"$set": {"key": "reject_reasons", "reasons": clean}}, upsert=True)
    return RejectReasons(reasons=clean)
