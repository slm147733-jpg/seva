"""Admin-only: users, stats, pages, links, settings. Every route depends on require_admin."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from lib.auth import hash_password, require_admin
from lib.db import db
from models.content import Link, LinkIn, Page, PageIn, Settings
from models.user import Ok, PasswordReset, Stats, UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------- Users ----------
@router.get("/users", response_model=list[UserOut])
async def list_users():
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)
    return [UserOut(**d) for d in docs]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(body: UserCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "mobile": body.mobile,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Mobile number already registered")
    return UserOut(**doc)


async def _get_user(user_id: str) -> dict:
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    return doc


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    doc = await _get_user(user_id)
    changes = body.model_dump(exclude_none=True)
    if user_id == admin["id"] and (changes.get("role") == "user" or changes.get("is_active") is False):
        raise HTTPException(status_code=400, detail="You cannot demote or deactivate your own account")
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    if changes:
        try:
            await db.users.update_one({"id": user_id}, {"$set": changes})
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="Mobile number already registered")
        if changes.get("is_active") is False:
            await db.sessions.delete_many({"user_id": user_id})
    doc.update(changes)
    return UserOut(**doc)


@router.post("/users/{user_id}/reset-password", response_model=Ok)
async def reset_password(user_id: str, body: PasswordReset):
    await _get_user(user_id)
    await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.sessions.delete_many({"user_id": user_id})
    return Ok()


@router.delete("/users/{user_id}", response_model=Ok)
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    await _get_user(user_id)
    await db.users.delete_one({"id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    return Ok()


@router.get("/stats", response_model=Stats)
async def stats():
    total = await db.users.count_documents({})
    active = await db.users.count_documents({"is_active": True})
    recent = await db.users.find(
        {"last_login": {"$ne": None}}, {"_id": 0, "password_hash": 0}
    ).sort("last_login", -1).to_list(6)
    return Stats(
        total_users=total,
        active_users=active,
        inactive_users=total - active,
        admins=await db.users.count_documents({"role": "admin"}),
        pages=await db.pages.count_documents({}),
        links=await db.links.count_documents({}),
        recent_logins=[UserOut(**d) for d in recent],
    )


# ---------- Pages ----------
@router.get("/pages", response_model=list[Page])
async def list_pages():
    docs = await db.pages.find({}, {"_id": 0}).sort("order", 1).to_list(500)
    return [Page(**d) for d in docs]


@router.post("/pages", response_model=Page, status_code=201)
async def create_page(body: PageIn):
    page = Page(**body.model_dump())
    try:
        await db.pages.insert_one(page.model_dump())
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A page with this slug already exists")
    return page


@router.put("/pages/{page_id}", response_model=Page)
async def update_page(page_id: str, body: PageIn):
    changes = {**body.model_dump(), "updated_at": datetime.now(timezone.utc)}
    try:
        res = await db.pages.update_one({"id": page_id}, {"$set": changes})
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="A page with this slug already exists")
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return Page(id=page_id, **changes)


@router.delete("/pages/{page_id}", response_model=Ok)
async def delete_page(page_id: str):
    res = await db.pages.delete_one({"id": page_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    return Ok()


# ---------- Links ----------
@router.get("/links", response_model=list[Link])
async def list_links():
    docs = await db.links.find({}, {"_id": 0}).sort("order", 1).to_list(500)
    return [Link(**d) for d in docs]


@router.post("/links", response_model=Link, status_code=201)
async def create_link(body: LinkIn):
    link = Link(**body.model_dump())
    await db.links.insert_one(link.model_dump())
    return link


@router.put("/links/{link_id}", response_model=Link)
async def update_link(link_id: str, body: LinkIn):
    doc = await db.links.find_one_and_update(
        {"id": link_id}, {"$set": body.model_dump()}, projection={"_id": 0}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Link not found")
    return Link(**doc)


@router.delete("/links/{link_id}", response_model=Ok)
async def delete_link(link_id: str):
    res = await db.links.delete_one({"id": link_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Link not found")
    return Ok()


# ---------- Settings ----------
@router.put("/settings", response_model=Settings)
async def update_settings(body: Settings):
    await db.settings.update_one({"key": "site"}, {"$set": {"key": "site", **body.model_dump()}}, upsert=True)
    return body
