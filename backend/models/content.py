import uuid
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

Audience = Literal["public", "users", "both"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PageIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    excerpt: str = Field(default="", max_length=300)
    content: str = Field(default="", max_length=50000)
    show_in_nav: bool = True
    order: int = 0


class Page(PageIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    updated_at: datetime = Field(default_factory=_now)


class LinkIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=500)
    description: str = Field(default="", max_length=200)
    category: str = Field(default="General", max_length=40)
    audience: Audience = "both"
    is_active: bool = True
    order: int = 0


class Link(LinkIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=_now)


class Settings(BaseModel):
    site_name: str = Field(default="Sevakendra", max_length=60)
    tagline: str = Field(default="Your trusted digital service centre", max_length=120)
    hero_title: str = Field(default="Every citizen service, one friendly counter.", max_length=160)
    hero_subtitle: str = Field(
        default="Apply, track and get help with government and utility services — fast, transparent and close to home.",
        max_length=400,
    )
    announcement: str = Field(default="", max_length=200)
    helpline: str = Field(default="", max_length=20)
    email: str = Field(default="", max_length=100)
    address: str = Field(default="", max_length=200)


class SiteData(BaseModel):
    settings: Settings
    nav_pages: list[Page]
    links: list[Link]
