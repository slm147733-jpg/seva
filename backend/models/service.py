import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=200)
    is_active: bool = True
    fee: float = Field(default=0, ge=0, le=1_000_000)  # ₹, 0 = free
    required_documents: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("required_documents")
    @classmethod
    def _clean_docs(cls, v: list[str]) -> list[str]:
        return [d.strip()[:120] for d in v if d and d.strip()]


class Service(ServiceIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_count: int = 0  # how many users have this service assigned (computed on read)
