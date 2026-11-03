"""Wallet: per-user balance, admin top-ups, user payment claims (UPI last-5 digits), optional fee deduction."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from lib.auth import current_user, require_admin
from lib.db import db
from models.user import Ok
from models.wallet import (
    AdjustIn, ApproveIn, PaymentInfo, RejectIn, WalletMe, WalletRequest, WalletRequestIn, WalletSettingsIn, WalletTxn,
)

router = APIRouter(tags=["wallet"])
bucket = AsyncIOMotorGridFSBucket(db, bucket_name="uploads")
MAX_QR = 5 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def wallet_settings() -> dict:
    return await db.settings.find_one({"key": "wallet"}, {"_id": 0}) or {}


async def _payment_info() -> PaymentInfo:
    s = await wallet_settings()
    return PaymentInfo(
        upi_id=s.get("upi_id", ""), payee_name=s.get("payee_name", ""),
        has_qr_image=bool(s.get("qr_file_id")), deduct_fees=bool(s.get("deduct_fees", False)),
    )


async def apply_txn(
    user: dict, kind: str, amount: float, reason: str, by: str, attachment_id: Optional[str] = None,
    category: str = "adjust", service_id: Optional[str] = None,
) -> WalletTxn:
    """Atomically change the balance. A debit fails with 402 if the balance is too low."""
    amount = round(amount, 2)
    if kind == "credit":
        doc = await db.users.find_one_and_update(
            {"id": user["id"]}, {"$inc": {"wallet_balance": amount}}, projection={"_id": 0}, return_document=True
        )
    else:
        doc = await db.users.find_one_and_update(
            {"id": user["id"], "wallet_balance": {"$gte": amount}},
            {"$inc": {"wallet_balance": -amount}}, projection={"_id": 0}, return_document=True,
        )
        if not doc:
            fresh = await db.users.find_one({"id": user["id"]}, {"wallet_balance": 1}) or {}
            have = round(fresh.get("wallet_balance", 0) or 0, 2)
            raise HTTPException(status_code=402, detail=f"Insufficient wallet balance: need ₹{amount:g}, available ₹{have:g}. Please add money to your wallet.")
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    txn = WalletTxn(
        id=str(uuid.uuid4()), user_id=user["id"], user_name=doc["name"], user_mobile=doc["mobile"], type=kind,
        amount=amount, reason=reason, balance_after=round(doc.get("wallet_balance", 0), 2), created_by=by,
        attachment_id=attachment_id, category=category, service_id=service_id, created_at=_now(),
    )
    await db.wallet_transactions.insert_one(txn.model_dump())
    return txn


async def _usual_fee(user: dict) -> tuple[float, str]:
    """Fee of the assigned service the user submits most often; else the priciest assigned service."""
    ids = user.get("service_ids") or []
    if not ids:
        return 0, ""
    services = await db.services.find({"id": {"$in": ids}, "is_active": True, "fee": {"$gt": 0}}, {"_id": 0, "id": 1, "name": 1, "fee": 1}).to_list(200)
    if not services:
        return 0, ""
    used = await db.attachments.aggregate([
        {"$match": {"user_id": user["id"], "service_id": {"$in": [s["id"] for s in services]}}},
        {"$group": {"_id": "$service_id", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 1},
    ]).to_list(1)
    by_id = {s["id"]: s for s in services}
    pick = by_id[used[0]["_id"]] if used else max(services, key=lambda s: s["fee"])
    return round(float(pick["fee"]), 2), pick["name"]


# ---------- User ----------
@router.get("/wallet/me", response_model=WalletMe)
async def wallet_me(user: dict = Depends(current_user)):
    txns = await db.wallet_transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    reqs = await db.wallet_requests.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    usual_fee, usual_name = await _usual_fee(user)
    return WalletMe(
        usual_fee=usual_fee, usual_service_name=usual_name,
        balance=round(user.get("wallet_balance", 0) or 0, 2), payment=await _payment_info(),
        transactions=[WalletTxn(**t) for t in txns], requests=[WalletRequest(**r) for r in reqs],
    )


@router.post("/wallet/requests", response_model=WalletRequest, status_code=201)
async def create_request(body: WalletRequestIn, user: dict = Depends(current_user)):
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins add money from the Wallet tab")
    if await db.wallet_requests.count_documents({"user_id": user["id"], "status": "pending"}) >= 5:
        raise HTTPException(status_code=429, detail="You already have 5 pending payments. Please wait for the admin to verify them.")
    if await db.wallet_requests.find_one({"user_id": user["id"], "txn_last5": body.txn_last5, "status": {"$ne": "rejected"}}):
        raise HTTPException(status_code=409, detail="You already submitted this transaction number")
    req = WalletRequest(
        id=str(uuid.uuid4()), user_id=user["id"], user_name=user["name"], user_mobile=user["mobile"],
        amount=round(body.amount, 2) if body.amount else None, txn_last5=body.txn_last5, status="pending", created_at=_now(),
    )
    await db.wallet_requests.insert_one(req.model_dump())
    return req


@router.get("/wallet/qr-image")
async def qr_image(_: dict = Depends(current_user)):
    fid = (await wallet_settings()).get("qr_file_id")
    if not fid:
        raise HTTPException(status_code=404, detail="No QR image uploaded")
    meta = await db["uploads.files"].find_one({"_id": ObjectId(fid)})
    if not meta:
        raise HTTPException(status_code=404, detail="No QR image uploaded")
    data = await (await bucket.open_download_stream(ObjectId(fid))).read()
    return Response(content=data, media_type=meta.get("metadata", {}).get("content_type", "image/png"), headers={"Cache-Control": "private, max-age=60"})


# ---------- Admin ----------
admin = APIRouter(prefix="/admin/wallet", tags=["wallet-admin"], dependencies=[Depends(require_admin)])


@admin.get("/settings", response_model=PaymentInfo)
async def get_settings():
    return await _payment_info()


@admin.put("/settings", response_model=PaymentInfo)
async def put_settings(body: WalletSettingsIn):
    await db.settings.update_one({"key": "wallet"}, {"$set": {"key": "wallet", **body.model_dump()}}, upsert=True)
    return await _payment_info()


@admin.post("/qr-image", response_model=PaymentInfo)
async def upload_qr(file: UploadFile = File(...)):
    ctype = file.content_type or ""
    if ctype not in ("image/png", "image/jpeg"):
        raise HTTPException(status_code=400, detail="QR image must be PNG or JPG")
    data = await file.read()
    if not data or len(data) > MAX_QR:
        raise HTTPException(status_code=400, detail="QR image must be under 5 MB")
    old = (await wallet_settings()).get("qr_file_id")
    oid = await bucket.upload_from_stream(file.filename or "qr.png", data, metadata={"owner_user_id": "__wallet_qr__", "content_type": ctype})
    await db.settings.update_one({"key": "wallet"}, {"$set": {"key": "wallet", "qr_file_id": str(oid)}}, upsert=True)
    if old:
        try:
            await bucket.delete(ObjectId(old))
        except Exception:
            pass
    return await _payment_info()


@admin.delete("/qr-image", response_model=PaymentInfo)
async def delete_qr():
    old = (await wallet_settings()).get("qr_file_id")
    await db.settings.update_one({"key": "wallet"}, {"$set": {"qr_file_id": None}})
    if old:
        try:
            await bucket.delete(ObjectId(old))
        except Exception:
            pass
    return await _payment_info()


@admin.get("/requests", response_model=list[WalletRequest])
async def list_requests(status: Optional[str] = Query(None, pattern="^(pending|approved|rejected)$")):
    q = {"status": status} if status else {}
    docs = await db.wallet_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [WalletRequest(**d) for d in docs]


async def _pending(request_id: str) -> dict:
    doc = await db.wallet_requests.find_one({"id": request_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Request not found")
    if doc["status"] != "pending":
        raise HTTPException(status_code=409, detail="This request was already handled")
    return doc


@admin.post("/requests/{request_id}/approve", response_model=WalletRequest)
async def approve(request_id: str, body: ApproveIn, me: dict = Depends(require_admin)):
    doc = await _pending(request_id)
    # Claim it first so a double click can't credit twice.
    res = await db.wallet_requests.update_one({"id": request_id, "status": "pending"}, {"$set": {"status": "approved"}})
    if res.modified_count == 0:
        raise HTTPException(status_code=409, detail="This request was already handled")
    user = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User no longer exists")
    await apply_txn(user, "credit", body.amount, f"Payment verified (Txn …{doc['txn_last5']})", me["name"], category="topup")
    changes = {"credited_amount": round(body.amount, 2), "admin_note": body.note.strip(), "resolved_at": _now()}
    await db.wallet_requests.update_one({"id": request_id}, {"$set": changes})
    return WalletRequest(**{**doc, **changes, "status": "approved"})


@admin.post("/requests/{request_id}/reject", response_model=WalletRequest)
async def reject(request_id: str, body: RejectIn):
    doc = await _pending(request_id)
    changes = {"status": "rejected", "admin_note": body.note.strip(), "resolved_at": _now()}
    await db.wallet_requests.update_one({"id": request_id, "status": "pending"}, {"$set": changes})
    return WalletRequest(**{**doc, **changes})


@admin.post("/users/{user_id}/adjust", response_model=WalletTxn)
async def adjust(user_id: str, body: AdjustIn, me: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    reason = body.reason.strip() or ("Added by admin" if body.direction == "add" else "Removed by admin")
    return await apply_txn(user, "credit" if body.direction == "add" else "debit", body.amount, reason, me["name"])


@admin.get("/transactions", response_model=list[WalletTxn])
async def transactions(user_id: Optional[str] = None):
    q = {"user_id": user_id} if user_id else {}
    docs = await db.wallet_transactions.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [WalletTxn(**d) for d in docs]


router.include_router(admin)
