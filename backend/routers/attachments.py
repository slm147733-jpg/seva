"""User file submissions, remarks chat, receipts and status (not_started → seen → processing → generated)."""

import io
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from urllib.parse import quote

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from PIL import Image

from lib.auth import current_user
from lib.db import db
from lib.whatsapp import queue_receipt_alert
from models.attachment import AttachmentDetail, AttachmentList, AttachmentOut, FileMeta, MessageOut, BulkDelete, DeleteResult
from lib.auth import require_admin

router = APIRouter(tags=["attachments"])
bucket = AsyncIOMotorGridFSBucket(db, bucket_name="uploads")

MAX_BYTES = 10 * 1024 * 1024
ALLOWED = {"pdf": "application/pdf", "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
PROCESSING_AFTER = timedelta(minutes=1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


async def _read_valid(upload: UploadFile) -> tuple[bytes, str, str]:
    name = (upload.filename or "file").strip() or "file"
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"{name}: only PDF, JPG, JPEG or PNG files are allowed")
    data = await upload.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail=f"{name}: file is empty")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail=f"{name}: file is larger than 10 MB")
    return data, name, ALLOWED[ext]


async def _store(data: bytes, filename: str, content_type: str, owner_user_id: str) -> FileMeta:
    oid = await bucket.upload_from_stream(
        filename, data, metadata={"owner_user_id": owner_user_id, "content_type": content_type}
    )
    return FileMeta(file_id=str(oid), filename=filename, content_type=content_type, size=len(data))


def _to_out(doc: dict, role: str, now: datetime) -> AttachmentOut:
    seen = _utc(doc.get("seen_at"))
    generated = _utc(doc.get("generated_at"))
    processing_at = seen + PROCESSING_AFTER if seen else None
    if generated:
        status = "generated"
    elif seen and now >= processing_at:
        status = "processing"
    elif seen:
        status = "seen"
    else:
        status = "not_started"
    if processing_at and not generated and now < processing_at:
        processing_at = None
    return AttachmentOut(
        **{k: doc[k] for k in ("id", "user_id", "user_name", "user_mobile", "file", "created_at",
                               "last_event_at", "last_event_role", "last_event_text", "message_count")},
        status=status,
        seen_at=seen,
        processing_at=processing_at,
        generated_at=generated,
        unread=bool(doc.get("unread_admin" if role == "admin" else "unread_user")),
    )


async def _create_attachment(user: dict, meta: FileMeta) -> dict:
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_mobile": user["mobile"],
        "file": meta.model_dump(),
        "created_at": now,
        "seen_at": None,
        "generated_at": None,
        "last_event_at": now,
        "last_event_role": "user",
        "last_event_text": f"{user['name']} uploaded {meta.filename}",
        "unread_admin": True,
        "unread_user": False,
        "message_count": 0,
    }
    await db.attachments.insert_one(doc)
    return doc


async def _load_visible(attachment_id: str, user: dict) -> dict:
    query: dict = {"id": attachment_id}
    if user["role"] != "admin":
        query["user_id"] = user["id"]  # users only ever reach their own files → 404 otherwise
    doc = await db.attachments.find_one(query, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return doc


@router.get("/attachments", response_model=AttachmentList)
async def list_attachments(user: dict = Depends(current_user)):
    query = {} if user["role"] == "admin" else {"user_id": user["id"]}
    docs = await db.attachments.find(query, {"_id": 0}).sort("last_event_at", -1).to_list(1000)
    now = _now()
    return AttachmentList(server_time=now, items=[_to_out(d, user["role"], now) for d in docs])


@router.post("/attachments", response_model=list[AttachmentOut], status_code=201)
async def upload_files(files: list[UploadFile] = File(...), user: dict = Depends(current_user)):
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins reply inside a user's attachment instead")
    if not files or len(files) > 20:
        raise HTTPException(status_code=400, detail="Attach between 1 and 20 files")
    validated = [await _read_valid(f) for f in files]  # validate all before storing any
    now = _now()
    out = []
    for data, name, ctype in validated:
        doc = await _create_attachment(user, await _store(data, name, ctype, user["id"]))
        out.append(_to_out(doc, user["role"], now))
    return out


@router.post("/attachments/camera", response_model=list[AttachmentOut], status_code=201)
async def upload_camera(
    files: list[UploadFile] = File(...),
    mode: Literal["pdf", "images"] = Form("images"),
    user: dict = Depends(current_user),
):
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins reply inside a user's attachment instead")
    if not files or len(files) > 30:
        raise HTTPException(status_code=400, detail="Capture between 1 and 30 photos")
    validated = [await _read_valid(f) for f in files]
    stamp = _now().strftime("%Y%m%d-%H%M%S")
    now = _now()
    if mode == "images":
        out = []
        for i, (data, _, ctype) in enumerate(validated, 1):
            meta = await _store(data, f"camera-{stamp}-{i}.jpg", ctype, user["id"])
            out.append(_to_out(await _create_attachment(user, meta), user["role"], now))
        return out
    try:
        images = [Image.open(io.BytesIO(d)).convert("RGB") for d, _, _ in validated]
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the captured photos")
    buf = io.BytesIO()
    images[0].save(buf, format="PDF", save_all=True, append_images=images[1:], resolution=150)
    pdf = buf.getvalue()
    if len(pdf) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Combined PDF is larger than 10 MB — capture fewer pages")
    meta = await _store(pdf, f"camera-{stamp}.pdf", "application/pdf", user["id"])
    return [_to_out(await _create_attachment(user, meta), user["role"], now)]


@router.get("/attachments/{attachment_id}", response_model=AttachmentDetail)
async def open_attachment(attachment_id: str, user: dict = Depends(current_user)):
    doc = await _load_visible(attachment_id, user)
    changes: dict = {}
    if user["role"] == "admin":
        if not doc.get("seen_at"):
            changes["seen_at"] = _now()  # admin opening the file marks it seen; processing follows a minute later
        if doc.get("unread_admin"):
            changes["unread_admin"] = False
    elif doc.get("unread_user"):
        changes["unread_user"] = False
    if changes:
        await db.attachments.update_one({"id": attachment_id}, {"$set": changes})
        doc.update(changes)
    msgs = await db.attachment_messages.find({"attachment_id": attachment_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    now = _now()
    return AttachmentDetail(
        server_time=now,
        attachment=_to_out(doc, user["role"], now),
        messages=[MessageOut(**m) for m in msgs],
    )


@router.post("/attachments/{attachment_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    attachment_id: str,
    request: Request,
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(current_user),
):
    doc = await _load_visible(attachment_id, user)
    text = text.strip()[:2000]
    if not text and not file:
        raise HTTPException(status_code=400, detail="Write a remark or attach a file")
    meta = None
    if file is not None:
        data, name, ctype = await _read_valid(file)
        meta = await _store(data, name, ctype, doc["user_id"])
    is_admin = user["role"] == "admin"
    now = _now()
    msg = MessageOut(
        id=str(uuid.uuid4()),
        attachment_id=attachment_id,
        sender_id=user["id"],
        sender_name=user["name"],
        sender_role=user["role"],
        text=text,
        file=meta,
        is_receipt=bool(is_admin and meta),
        created_at=now,
    )
    await db.attachment_messages.insert_one(msg.model_dump())
    if msg.is_receipt:
        event = f"Receipt sent: {meta.filename}"
    elif meta:
        event = f"{user['name']} attached {meta.filename}"
    else:
        event = f"{user['name']}: {text[:80]}"
    changes: dict = {
        "last_event_at": now,
        "last_event_role": user["role"],
        "last_event_text": event,
        "unread_user" if is_admin else "unread_admin": True,
    }
    if is_admin and not doc.get("seen_at"):
        changes["seen_at"] = now
    if msg.is_receipt and not doc.get("generated_at"):
        changes["generated_at"] = now  # receipt upload freezes the timer
    await db.attachments.update_one({"id": attachment_id}, {"$set": changes, "$inc": {"message_count": 1}})
    if msg.is_receipt:
        owner = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0})
        if owner:
            app_url = request.headers.get("origin") or os.environ.get("APP_URL", "")
            await queue_receipt_alert(owner, doc, app_url)
    return msg


@router.get("/files/{file_id}")
async def get_file(file_id: str, download: bool = Query(False), user: dict = Depends(current_user)):
    try:
        oid = ObjectId(file_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="File not found")
    meta = await db["uploads.files"].find_one({"_id": oid})
    if not meta or (user["role"] != "admin" and meta.get("metadata", {}).get("owner_user_id") != user["id"]):
        raise HTTPException(status_code=404, detail="File not found")
    stream = await bucket.open_download_stream(oid)
    data = await stream.read()
    disp = "attachment" if download else "inline"
    name = meta["filename"]
    ascii_name = name.encode("ascii", "ignore").decode().replace('"', "").strip() or "file"
    return Response(
        content=data,
        media_type=meta.get("metadata", {}).get("content_type", "application/octet-stream"),
        headers={
            "Content-Disposition": f"{disp}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name)}",
            "Cache-Control": "private, max-age=3600",
        },
    )


# ---------- Admin: delete files (attachment + its thread, stored files and alerts) ----------
async def _purge(ids: list[str]) -> int:
    docs = await db.attachments.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "file": 1}).to_list(len(ids))
    if not docs:
        return 0
    found = [d["id"] for d in docs]
    file_ids = [d["file"]["file_id"] for d in docs]
    async for m in db.attachment_messages.find({"attachment_id": {"$in": found}, "file": {"$ne": None}}, {"file.file_id": 1}):
        file_ids.append(m["file"]["file_id"])
    for fid in file_ids:
        try:
            await bucket.delete(ObjectId(fid))
        except Exception:  # already gone / bad id — keep purging the rest
            pass
    await db.attachment_messages.delete_many({"attachment_id": {"$in": found}})
    await db.whatsapp_alerts.delete_many({"attachment_id": {"$in": found}})
    await db.attachments.delete_many({"id": {"$in": found}})
    return len(found)


@router.delete("/attachments/{attachment_id}", response_model=DeleteResult, dependencies=[Depends(require_admin)])
async def delete_attachment(attachment_id: str):
    if await _purge([attachment_id]) == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return DeleteResult(deleted=1)


@router.post("/attachments/bulk-delete", response_model=DeleteResult, dependencies=[Depends(require_admin)])
async def bulk_delete(body: BulkDelete):
    return DeleteResult(deleted=await _purge(body.ids))
