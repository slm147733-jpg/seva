from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class CreateOrderIn(BaseModel):
    amount: int = Field(description="Amount in paise (min 100 = ₹1)")


class CreateOrderOut(BaseModel):
    order_id: str
    amount: int  # paise
    currency: str
    key_id: str  # public key only — the secret never leaves the backend
    name: str
    prefill_name: str
    prefill_contact: str


class VerifyPaymentIn(BaseModel):
    # Defaults let the handler answer 400 (not 422) when a field is missing.
    razorpay_order_id: str = ""
    razorpay_payment_id: str = ""
    razorpay_signature: str = ""


class VerifyPaymentOut(BaseModel):
    success: bool
    credited: float  # rupees added to the wallet by this call (0 if already credited earlier)
    balance: float


class PaymentsStatus(BaseModel):
    configured: bool
    mode: Literal["test", "live", "none"]
    webhook_configured: bool = False
    webhook_url: str = ""


class WebhookAck(BaseModel):
    ok: bool
    credited: float = 0
    detail: str = ""


class OnlineOrder(BaseModel):
    order_id: str
    user_id: str
    amount: int
    currency: str
    status: Literal["created", "paid"]
    payment_id: str | None = None
    created_at: datetime
    paid_at: datetime | None = None
