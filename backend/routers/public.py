"""Public (no-auth) website content."""

from fastapi import APIRouter, HTTPException

from lib.db import db
from models.content import Link, Page, Settings, SiteData

router = APIRouter(tags=["public"])


async def load_settings() -> Settings:
    doc = await db.settings.find_one({"key": "site"}, {"_id": 0, "key": 0})
    return Settings(**(doc or {}))


@router.get("/site", response_model=SiteData)
async def site():
    pages = await db.pages.find({"show_in_nav": True}, {"_id": 0}).sort("order", 1).to_list(100)
    links = await db.links.find(
        {"is_active": True, "audience": {"$in": ["public", "both"]}}, {"_id": 0}
    ).sort("order", 1).to_list(500)
    return SiteData(
        settings=await load_settings(),
        nav_pages=[Page(**p) for p in pages],
        links=[Link(**link) for link in links],
    )


@router.get("/pages/{slug}", response_model=Page)
async def page_by_slug(slug: str):
    doc = await db.pages.find_one({"slug": slug}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Page not found")
    return Page(**doc)
