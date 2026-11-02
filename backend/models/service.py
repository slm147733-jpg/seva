import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, Field


class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=200)
    is_active: bool = True


class Service(ServiceIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_count: int = 0  # how many users have this service assigned (computed on read)
