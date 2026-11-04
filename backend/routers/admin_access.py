"""Owner-only: approve or reject admin registration requests and set each admin's access level."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import is_owner, require_owner
from lib.db import db
from models.user import AdminRequest, ApproveAdminIn, ScopeIn, UserOut

router = APIRouter(prefix="/admin", tags=["admin-access"], dependencies=[Depends(require_owner)])


@router.get("/admin-requests", response_model=list[AdminRequest])
async def list_requests():
    docs = await db.admin_requests.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(100)
    return [AdminRequest(**d) for d in docs]


async def _claim(request_id: str, status: str, scope: str | None) -> dict:
    doc = await db.admin_requests.find_one_and_update(
        {"id": request_id, "status": "pending"},
        {"$set": {"status": status, "scope": scope, "resolved_at": datetime.now(timezone.utc)}},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Request not found or already handled")
    return doc


@router.post("/admin-requests/{request_id}/approve", response_model=UserOut)
async def approve(request_id: str, body: ApproveAdminIn):
    req = await db.admin_requests.find_one({"id": request_id, "status": "pending"}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found or already handled")
    if await db.users.find_one({"mobile": req["mobile"]}):
        raise HTTPException(status_code=409, detail="That mobile number already has an account")
    req = await _claim(request_id, "approved", body.scope)
    user = {"id": str(uuid.uuid4()), "name": req["name"], "mobile": req["mobile"], "password_hash": req["password_hash"],
            "role": "admin", "admin_scope": body.scope, "is_active": True, "created_at": datetime.now(timezone.utc),
            "last_login": None, "service_ids": [], "wallet_balance": 0}
    await db.users.insert_one(user)
    return UserOut(**user)


@router.post("/admin-requests/{request_id}/reject", response_model=AdminRequest)
async def reject(request_id: str):
    req = await _claim(request_id, "rejected", None)
    req.update(status="rejected", resolved_at=datetime.now(timezone.utc))
    return AdminRequest(**req)


@router.put("/admins/{user_id}/scope", response_model=UserOut)
async def set_scope(user_id: str, body: ScopeIn):
    user = await db.users.find_one({"id": user_id, "role": "admin"}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Admin not found")
    if is_owner(user):
        raise HTTPException(status_code=400, detail="The owner always has full access")
    await db.users.update_one({"id": user_id}, {"$set": {"admin_scope": body.scope}})
    return UserOut(**{**user, "admin_scope": body.scope})
