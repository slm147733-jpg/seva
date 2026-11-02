from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

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
    service_id: Optional[str] = None
    service_name: str = "General"
    service_fee: Optional[float] = None
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
    missing_documents: list[str] = []  # requested by admin
    missing_resolved: list[str] = []  # subset the user has since sent


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
    for_document: Optional[str] = None
    created_at: datetime


class AttachmentDetail(BaseModel):
    server_time: datetime
    attachment: AttachmentOut
    messages: list[MessageOut]
    service_required_documents: list[str] = []


class MissingRequest(BaseModel):
    documents: list[str] = Field(default_factory=list, max_length=30)
    note: str = Field(default="", max_length=500)


class BulkDelete(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class DeleteResult(BaseModel):
    deleted: int
