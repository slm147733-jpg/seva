"""Password hashing, sessions (httpOnly cookie), and role dependencies."""

import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request, Response

from lib.db import db

COOKIE = "sk_session"
SESSION_DAYS = 7


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


async def create_session(response: Response, user_id: str) -> None:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.sessions.insert_one(
        {"token": token, "user_id": user_id, "created_at": now, "expires_at": now + timedelta(days=SESSION_DAYS)}
    )
    response.set_cookie(
        COOKIE, token, httponly=True, samesite="lax", secure=True, max_age=SESSION_DAYS * 86400, path="/"
    )


async def destroy_session(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        await db.sessions.delete_one({"token": token})
    response.delete_cookie(COOKIE, path="/")


async def current_user(request: Request) -> dict:
    """Re-reads the user every request so deactivation/deletion takes effect immediately."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.sessions.find_one({"token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Session expired")
    expires = session["expires_at"].replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        await db.sessions.delete_one({"token": token})
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account unavailable")
    return user


OWNER_MOBILE = "7396406422"


def is_owner(user: dict) -> bool:
    return user.get("role") == "admin" and user.get("mobile") == OWNER_MOBILE


def _files_scope_allows(request: Request) -> bool:
    """'Files only' admins may work on user files and receipts — nothing else (no deletes, wallets, users, settings)."""
    path, method = request.url.path, request.method
    if path.startswith("/api/attachments"):
        return method != "DELETE" and not path.endswith("/bulk-delete")
    return method == "GET" and path == "/api/admin/reject-reasons"


async def require_admin(request: Request, user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    if user.get("admin_scope") == "files" and not is_owner(user) and not _files_scope_allows(request):
        raise HTTPException(status_code=403, detail="Your admin access covers User files only")
    return user


async def require_owner(user: dict = Depends(current_user)) -> dict:
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Only the owner admin can do this")
    return user


# ---- Login lockout: 5 wrong passwords lock that mobile number for 15 minutes ----
MAX_FAILS, LOCK_MINUTES = 5, 15


async def check_lock(mobile: str) -> None:
    doc = await db.login_attempts.find_one({"mobile": mobile})
    until = doc and doc.get("locked_until")
    if until and until.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc):
        mins = max(1, int((until.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        raise HTTPException(status_code=429, detail=f"Too many wrong passwords. Try again in {mins} minute{'s' if mins != 1 else ''}.")


async def record_fail(mobile: str) -> int:
    """Returns attempts left before lock (0 = just locked)."""
    doc = await db.login_attempts.find_one_and_update(
        {"mobile": mobile}, {"$inc": {"fails": 1}, "$setOnInsert": {"mobile": mobile}}, upsert=True, return_document=True,
    )
    fails = doc.get("fails", 1)
    if fails >= MAX_FAILS:
        await db.login_attempts.update_one({"mobile": mobile}, {"$set": {
            "fails": 0, "locked_until": datetime.now(timezone.utc) + timedelta(minutes=LOCK_MINUTES)}})
        return 0
    return MAX_FAILS - fails


async def clear_fails(mobile: str) -> None:
    await db.login_attempts.delete_one({"mobile": mobile})
