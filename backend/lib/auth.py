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
        COOKIE, token, httponly=True, samesite="none", secure=True, max_age=SESSION_DAYS * 86400, path="/"
    )
    # Static sites on another domain (e.g. Hostinger) can't rely on third-party cookies,
    # so the token is also handed back for the browser to send as a Bearer header.
    response.headers["X-Session-Token"] = token


def _token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return request.cookies.get(COOKIE) or request.query_params.get("t")


async def destroy_session(request: Request, response: Response) -> None:
    token = _token(request)
    if token:
        await db.sessions.delete_one({"token": token})
    response.delete_cookie(COOKIE, path="/")


async def current_user(request: Request) -> dict:
    """Re-reads the user every request so deactivation/deletion takes effect immediately."""
    token = _token(request)
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


async def require_admin(user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
