"""Razorpay Standard Checkout: create an order, verify the signature, credit the wallet once."""

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from lib.auth import current_user, require_admin
from lib.db import db
from models.payment import CreateOrderIn, CreateOrderOut, OnlineOrder, PaymentsStatus, VerifyPaymentIn, VerifyPaymentOut
from routers.wallet import apply_txn

router = APIRouter(tags=["payments"])
MIN_PAISE = 100
MAX_PAISE = 1_000_000 * 100


def _keys() -> tuple[str, str]:
    key_id, secret = os.environ.get("RAZORPAY_KEY_ID", "").strip(), os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not secret:
        raise HTTPException(status_code=503, detail="Online payments are not set up yet. Please contact the admin.")
    return key_id, secret


def _user_only(user: dict) -> None:
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins add money from the Wallet tab")


@router.post("/create-order", response_model=CreateOrderOut)
async def create_order(body: CreateOrderIn, user: dict = Depends(current_user)):
    _user_only(user)
    if body.amount < MIN_PAISE:
        raise HTTPException(status_code=400, detail="Minimum top-up is ₹1")
    if body.amount > MAX_PAISE:
        raise HTTPException(status_code=400, detail="Amount is too large")
    key_id, secret = _keys()
    client = razorpay.Client(auth=(key_id, secret))
    receipt = f"w_{uuid.uuid4().hex[:20]}"  # Razorpay limit: 40 chars
    try:
        order = await run_in_threadpool(client.order.create, {
            "amount": body.amount, "currency": "INR", "receipt": receipt,
            "notes": {"user_id": user["id"], "purpose": "wallet_topup"},
        })
    except razorpay.errors.BadRequestError as e:
        if "auth" in str(e).lower():
            raise HTTPException(status_code=401, detail="Payment gateway rejected our keys. Please contact the admin.")
        raise HTTPException(status_code=500, detail=f"Could not start payment: {e}")
    except Exception:
        raise HTTPException(status_code=500, detail="Could not reach the payment gateway. Please try again.")
    rec = OnlineOrder(order_id=order["id"], user_id=user["id"], amount=order["amount"], currency=order["currency"],
                      status="created", created_at=datetime.now(timezone.utc))
    await db.razorpay_orders.insert_one(rec.model_dump())
    site = await db.settings.find_one({"key": "site"}, {"_id": 0, "site_name": 1}) or {}
    return CreateOrderOut(order_id=order["id"], amount=order["amount"], currency=order["currency"], key_id=key_id,
                          name=site.get("site_name") or "Sevakendra", prefill_name=user["name"], prefill_contact=user["mobile"])


@router.post("/verify-payment", response_model=VerifyPaymentOut)
async def verify_payment(body: VerifyPaymentIn, user: dict = Depends(current_user)):
    _user_only(user)
    oid, pid, sig = body.razorpay_order_id.strip(), body.razorpay_payment_id.strip(), body.razorpay_signature.strip()
    if not oid or not pid or not sig:
        raise HTTPException(status_code=400, detail="Missing payment details")
    _, secret = _keys()
    expected = hmac.new(secret.encode(), f"{oid}|{pid}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Payment could not be verified")
    order = await db.razorpay_orders.find_one({"order_id": oid, "user_id": user["id"]}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=400, detail="Payment could not be verified")
    # Claim the order once so a retry or double submit can never credit twice.
    claimed = await db.razorpay_orders.update_one(
        {"order_id": oid, "status": "created"},
        {"$set": {"status": "paid", "payment_id": pid, "paid_at": datetime.now(timezone.utc)}},
    )
    credited = 0.0
    if claimed.modified_count == 1:
        credited = round(order["amount"] / 100, 2)
        await apply_txn(user, "credit", credited, f"Online payment (Razorpay {pid})", "Razorpay", category="topup")
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1}) or {}
    return VerifyPaymentOut(success=True, credited=credited, balance=round(fresh.get("wallet_balance", 0) or 0, 2))


@router.get("/admin/payments/status", response_model=PaymentsStatus, dependencies=[Depends(require_admin)])
async def payments_status():
    key_id, secret = os.environ.get("RAZORPAY_KEY_ID", "").strip(), os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not secret:
        return PaymentsStatus(configured=False, mode="none")
    return PaymentsStatus(configured=True, mode="live" if key_id.startswith("rzp_live_") else "test")
