from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class WalletTxn(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_mobile: str
    type: Literal["credit", "debit"]
    amount: float
    reason: str
    balance_after: float
    created_by: str
    attachment_id: Optional[str] = None
    category: Literal["fee", "refund", "topup", "adjust"] = "adjust"
    service_id: Optional[str] = None
    created_at: datetime


class WalletRequestIn(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0, le=1_000_000)
    txn_last5: str = Field(pattern=r"^\d{5}$")


class WalletRequest(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_mobile: str
    amount: Optional[float] = None  # what the user says they paid
    txn_last5: str
    status: Literal["pending", "approved", "rejected"]
    credited_amount: Optional[float] = None
    admin_note: str = ""
    created_at: datetime
    resolved_at: Optional[datetime] = None


class PaymentInfo(BaseModel):
    upi_id: str = ""
    payee_name: str = ""
    has_qr_image: bool = False
    deduct_fees: bool = False


class WalletMe(BaseModel):
    balance: float
    payment: PaymentInfo
    transactions: list[WalletTxn]
    requests: list[WalletRequest]
    usual_fee: float = 0  # fee of the user's most-used (or priciest assigned) service
    usual_service_name: str = ""


class WalletSettingsIn(BaseModel):
    upi_id: str = Field(default="", max_length=80, pattern=r"^$|^[\w.\-]{2,}@[A-Za-z][\w.\-]*$")
    payee_name: str = Field(default="", max_length=80)
    deduct_fees: bool = False


class AdjustIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    direction: Literal["add", "remove"] = "add"
    reason: str = Field(default="", max_length=200)


class ApproveIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000)
    note: str = Field(default="", max_length=200)


class RejectIn(BaseModel):
    note: str = Field(default="", max_length=200)
