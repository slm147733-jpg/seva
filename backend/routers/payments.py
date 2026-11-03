"""Razorpay Standard Checkout: create an order, verify the signature, credit the wallet once."""

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from lib.auth import current_user, require_admin
from lib.db import db
from models.payment import ConnectionTest, CreateOrderIn, CreateOrderOut, OnlineOrder, PaymentsStatus, VerifyPaymentIn, VerifyPaymentOut, WebhookAck
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


async def _credit_once(order: dict, pid: str, via: str) -> float:
    """Claim the order once (created → paid) and credit the wallet. Shared by checkout verify and the webhook,
    so whichever arrives first credits and the other is a no-op."""
    claimed = await db.razorpay_orders.update_one(
        {"order_id": order["order_id"], "status": "created"},
        {"$set": {"status": "paid", "payment_id": pid, "paid_at": datetime.now(timezone.utc), "credited_via": via}},
    )
    if claimed.modified_count != 1:
        return 0.0
    owner = await db.users.find_one({"id": order["user_id"]}, {"_id": 0})
    if not owner:
        return 0.0
    amount = round(order["amount"] / 100, 2)
    await apply_txn(owner, "credit", amount, f"Online payment (Razorpay {pid})", "Razorpay", category="topup")
    return amount


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
    credited = await _credit_once(order, pid, "checkout")
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "wallet_balance": 1}) or {}
    return VerifyPaymentOut(success=True, credited=credited, balance=round(fresh.get("wallet_balance", 0) or 0, 2))


@router.post("/razorpay/webhook", response_model=WebhookAck)
async def razorpay_webhook(request: Request):
    """Backup credit: Razorpay calls this on payment.captured / order.paid even if the user closed the page."""
    secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook secret not configured")
    raw = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if not sig or not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=400, detail="Invalid signature")
    try:
        event = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    name = event.get("event", "")
    if name not in ("payment.captured", "order.paid"):
        return WebhookAck(ok=True, credited=0, detail=f"ignored {name}")
    payment = ((event.get("payload") or {}).get("payment") or {}).get("entity") or {}
    oid, pid = payment.get("order_id"), payment.get("id")
    if not oid or not pid:
        return WebhookAck(ok=True, credited=0, detail="no order on payment")
    order = await db.razorpay_orders.find_one({"order_id": oid}, {"_id": 0})
    if not order:
        return WebhookAck(ok=True, credited=0, detail="unknown order")  # not ours — ack so Razorpay stops retrying
    if int(payment.get("amount") or 0) != int(order["amount"]):
        return WebhookAck(ok=True, credited=0, detail="amount mismatch")
    return WebhookAck(ok=True, credited=await _credit_once(order, pid, "webhook"))


@router.get("/admin/payments/status", response_model=PaymentsStatus, dependencies=[Depends(require_admin)])
async def payments_status(request: Request):
    key_id, secret = os.environ.get("RAZORPAY_KEY_ID", "").strip(), os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    base = request.headers.get("origin") or os.environ.get("APP_URL", "").rstrip("/")
    webhook = bool(os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip())
    url = f"{base}/api/razorpay/webhook" if base else "/api/razorpay/webhook"
    if not key_id or not secret:
        return PaymentsStatus(configured=False, mode="none", webhook_configured=webhook, webhook_url=url)
    return PaymentsStatus(configured=True, mode="live" if key_id.startswith("rzp_live_") else "test",
                          webhook_configured=webhook, webhook_url=url)


@router.post("/admin/payments/test", response_model=ConnectionTest, dependencies=[Depends(require_admin)])
async def test_connection():
    """Read-only call (list 1 order) to prove the saved key pair is accepted by Razorpay. Creates nothing."""
    key_id, secret = os.environ.get("RAZORPAY_KEY_ID", "").strip(), os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    if not key_id or not secret:
        return ConnectionTest(ok=False, mode="none", detail="No Razorpay keys are saved yet.")
    mode = "live" if key_id.startswith("rzp_live_") else "test"
    if not key_id.startswith("rzp_"):
        return ConnectionTest(ok=False, mode=mode, detail="The Key ID should start with rzp_test_ or rzp_live_. It looks like a different value was saved.")
    if key_id == secret:
        return ConnectionTest(ok=False, mode=mode, detail="The Key ID and Key Secret are the same value. Save each in its own box.")
    client = razorpay.Client(auth=(key_id, secret))
    try:
        await run_in_threadpool(client.order.all, {"count": 1})
    except razorpay.errors.BadRequestError as e:
        if "auth" in str(e).lower():
            return ConnectionTest(ok=False, mode=mode, detail="Razorpay refused these keys. They may have been regenerated or deleted. Save the current Key ID and Key Secret.")
        return ConnectionTest(ok=False, mode=mode, detail=f"Razorpay returned an error: {e}")
    except Exception:
        return ConnectionTest(ok=False, mode=mode, detail="Could not reach Razorpay. Check the internet connection and try again.")
    return ConnectionTest(ok=True, mode=mode, detail=f"Connected. Razorpay accepted the {mode.upper()} keys.")
