import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pymongo.errors import DuplicateKeyError

from lib.auth import create_session, current_user, destroy_session, hash_password, verify_password
from lib.db import db
from models.content import Link
from models.user import LoginIn, Ok, PasswordChange, ProfileUpdate, SetupIn, SetupStatus, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


LOCK = {"key": "admin_setup_locked"}


async def _setup_closed() -> bool:
    # Permanently closed once an admin was ever registered — deleting admins later never reopens it.
    return bool(await db.settings.find_one(LOCK)) or await db.users.count_documents({"role": "admin"}) > 0


@router.get("/setup-status", response_model=SetupStatus)
async def setup_status():
    return SetupStatus(needs_setup=not await _setup_closed())


@router.post("/setup", response_model=UserOut)
async def setup_first_admin(body: SetupIn, response: Response):
    # One-time only: claim the lock atomically so two simultaneous sign-ups can't both succeed.
    if await _setup_closed():
        raise HTTPException(status_code=403, detail="Admin is already registered. Please log in.")
    claimed = await db.settings.update_one(LOCK, {"$setOnInsert": {**LOCK, "at": datetime.now(timezone.utc)}}, upsert=True)
    if claimed.upserted_id is None:
        raise HTTPException(status_code=403, detail="Admin is already registered. Please log in.")
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "mobile": body.mobile,
        "password_hash": hash_password(body.password),
        "role": "admin",
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "last_login": datetime.now(timezone.utc),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Mobile number already registered")
    await create_session(response, doc["id"])
    return UserOut(**doc)


@router.post("/login", response_model=UserOut)
async def login(body: LoginIn, response: Response):
    user = await db.users.find_one({"mobile": body.mobile}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid mobile number or password")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Your account is deactivated. Contact the admin.")
    now = datetime.now(timezone.utc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login": now}})
    user["last_login"] = now
    await create_session(response, user["id"])
    return UserOut(**user)


@router.post("/logout", response_model=Ok)
async def logout(request: Request, response: Response):
    await destroy_session(request, response)
    return Ok()


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(current_user)):
    return UserOut(**user)


@router.put("/me", response_model=UserOut)
async def update_profile(body: ProfileUpdate, user: dict = Depends(current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"name": body.name.strip()}})
    user["name"] = body.name.strip()
    return UserOut(**user)


@router.post("/me/password", response_model=Ok)
async def change_password(body: PasswordChange, user: dict = Depends(current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return Ok()


@router.get("/me/links", response_model=list[Link])
async def my_links(user: dict = Depends(current_user)):
    docs = await db.links.find(
        {"is_active": True, "audience": {"$in": ["users", "both"]}}, {"_id": 0}
    ).sort("order", 1).to_list(500)
    return [Link(**d) for d in docs]
