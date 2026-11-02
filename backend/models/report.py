from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class DayRow(BaseModel):
    date: str  # YYYY-MM-DD (IST)
    received: int
    seen: int
    generated: int
    avg_minutes: Optional[float] = None  # average time taken for receipts generated that day


class StatusCounts(BaseModel):
    not_started: int
    seen: int
    processing: int
    generated: int


class DailyReport(BaseModel):
    today: str
    days: list[DayRow]
    current: StatusCounts
    total_received: int
    total_generated: int
    avg_minutes: Optional[float] = None


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
