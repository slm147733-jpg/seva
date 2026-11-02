from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

Status = Literal["not_started", "seen", "processing", "generated"]


class FileMeta(BaseModel):
    file_id: str
    filename: str
    content_type: str
    size: int


class AttachmentOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_mobile: str
    file: FileMeta
    status: Status
    created_at: datetime
    seen_at: Optional[datetime] = None
    processing_at: Optional[datetime] = None  # seen_at + 60s, once reached
    generated_at: Optional[datetime] = None
    last_event_at: datetime
    last_event_role: Literal["admin", "user"]
    last_event_text: str
    unread: bool  # unread for the caller's side
    message_count: int


class AttachmentList(BaseModel):
    server_time: datetime
    items: list[AttachmentOut]


class MessageOut(BaseModel):
    id: str
    attachment_id: str
    sender_id: str
    sender_name: str
    sender_role: Literal["admin", "user"]
    text: str
    file: Optional[FileMeta] = None
    is_receipt: bool
    created_at: datetime


class AttachmentDetail(BaseModel):
    server_time: datetime
    attachment: AttachmentOut
    messages: list[MessageOut]
