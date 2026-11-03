from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class DayRow(BaseModel):
    date: str  # YYYY-MM-DD (IST)
    received: int
    seen: int
    generated: int
    avg_minutes: Optional[float] = None  # average time taken for receipts generated that day
    rejected: int = 0
    fees_collected: float = 0
    refunds: float = 0
    net_fees: float = 0
    topups: float = 0  # money users added via verified QR payments that day (not service-filtered)


class StatusCounts(BaseModel):
    not_started: int
    seen: int
    processing: int
    generated: int
    rejected: int = 0


class DailyReport(BaseModel):
    today: str
    days: list[DayRow]
    current: StatusCounts
    total_received: int
    total_generated: int
    avg_minutes: Optional[float] = None
    total_fees_collected: float = 0  # within the selected range
    total_refunds: float = 0
    total_net_fees: float = 0
    total_topups: float = 0


class WhatsAppAlert(BaseModel):
    id: str
    user_id: str
    user_name: str
    mobile: str
    attachment_id: str
    message: str
    status: Literal["not_connected", "sent", "failed"]
    detail: str
    created_at: datetime


class ServiceIncome(BaseModel):
    service_id: Optional[str] = None
    service_name: str
    files: int  # files charged a fee this month
    fees_collected: float
    refunds: float
    net: float


class MonthIncome(BaseModel):
    month: str  # YYYY-MM (IST)
    fees_collected: float
    refunds: float
    net: float
    services: list[ServiceIncome]  # sorted by net, highest first


class MonthlyIncome(BaseModel):
    months: list[MonthIncome]  # newest first
