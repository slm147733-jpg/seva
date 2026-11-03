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
from routers.services import assignable_service
from routers.wallet import apply_txn, wallet_settings
from models.attachment import AttachmentDetail, AttachmentList, AttachmentOut, FileMeta, MessageOut, BulkDelete, DeleteResult, MissingRequest, RejectFileIn
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
    rejected = _utc(doc.get("rejected_at"))
    processing_at = seen + PROCESSING_AFTER if seen else None
    if rejected:
        status = "rejected"
    elif generated:
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
        service_id=doc.get("service_id"),
        service_name=doc.get("service_name") or "General",
        service_fee=doc.get("service_fee"),
        status=status,
        seen_at=seen,
        processing_at=processing_at,
        generated_at=generated,
        unread=bool(doc.get("unread_admin" if role == "admin" else "unread_user")),
        missing_documents=doc.get("missing_documents") or [],
        missing_resolved=doc.get("missing_resolved") or [],
        rejected_at=rejected,
        reject_reason=doc.get("reject_reason") or "",
        fee_charged=doc.get("fee_charged") or 0,
        fee_refunded=bool(doc.get("fee_refunded")),
    )


async def _create_attachment(user: dict, meta: FileMeta, service: dict, fee_charged: float = 0) -> dict:
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user["name"],
        "user_mobile": user["mobile"],
        "service_id": service["id"],
        "service_name": service["name"],  # snapshot: stays readable if the service is renamed/deleted
        "service_fee": service.get("fee", 0),
        "file": meta.model_dump(),
        "created_at": now,
        "seen_at": None,
        "generated_at": None,
        "last_event_at": now,
        "last_event_role": "user",
        "last_event_text": f"{user['name']} uploaded {meta.filename} for {service['name']}",
        "unread_admin": True,
        "unread_user": False,
        "message_count": 0,
        "fee_charged": fee_charged,
        "fee_refunded": False,
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
async def upload_files(
    files: list[UploadFile] = File(...),
    service_id: str = Form(..., min_length=1),
    user: dict = Depends(current_user),
):
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins reply inside a user's attachment instead")
    service = await assignable_service(user, service_id)
    if not files or len(files) > 20:
        raise HTTPException(status_code=400, detail="Attach between 1 and 20 files")
    validated = [await _read_valid(f) for f in files]  # validate all before storing any
    fee = await _charge_fee(user, service, len(validated))
    now = _now()
    out = []
    for data, name, ctype in validated:
        doc = await _create_attachment(user, await _store(data, name, ctype, user["id"]), service, fee)
        out.append(_to_out(doc, user["role"], now))
    return out


@router.post("/attachments/camera", response_model=list[AttachmentOut], status_code=201)
async def upload_camera(
    files: list[UploadFile] = File(...),
    mode: Literal["pdf", "images"] = Form("images"),
    service_id: str = Form(..., min_length=1),
    user: dict = Depends(current_user),
):
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins reply inside a user's attachment instead")
    service = await assignable_service(user, service_id)
    if not files or len(files) > 30:
        raise HTTPException(status_code=400, detail="Capture between 1 and 30 photos")
    validated = [await _read_valid(f) for f in files]
    stamp = _now().strftime("%Y%m%d-%H%M%S")
    now = _now()
    if mode == "images":
        fee = await _charge_fee(user, service, len(validated))
        out = []
        for i, (data, _, ctype) in enumerate(validated, 1):
            meta = await _store(data, f"camera-{stamp}-{i}.jpg", ctype, user["id"])
            out.append(_to_out(await _create_attachment(user, meta, service, fee), user["role"], now))
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
    fee = await _charge_fee(user, service, 1)
    meta = await _store(pdf, f"camera-{stamp}.pdf", "application/pdf", user["id"])
    return [_to_out(await _create_attachment(user, meta, service, fee), user["role"], now)]


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
    svc = await db.services.find_one({"id": doc.get("service_id")}, {"_id": 0, "required_documents": 1}) if doc.get("service_id") else None
    return AttachmentDetail(
        server_time=now,
        attachment=_to_out(doc, user["role"], now),
        messages=[MessageOut(**m) for m in msgs],
        service_required_documents=(svc or {}).get("required_documents", []),
    )


@router.post("/attachments/{attachment_id}/messages", response_model=MessageOut, status_code=201)
async def post_message(
    attachment_id: str,
    request: Request,
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    for_document: str = Form(""),
    user: dict = Depends(current_user),
):
    doc = await _load_visible(attachment_id, user)
    text = text.strip()[:2000]
    for_document = for_document.strip()
    is_admin = user["role"] == "admin"
    if for_document and (is_admin or not file or for_document not in (doc.get("missing_documents") or [])):
        raise HTTPException(status_code=400, detail="That document was not requested for this file")
    if not text and not file:
        raise HTTPException(status_code=400, detail="Write a remark or attach a file")
    if is_admin and file is not None and doc.get("rejected_at"):
        raise HTTPException(status_code=400, detail="This file was rejected — a receipt can't be sent for it")
    meta = None
    if file is not None:
        data, name, ctype = await _read_valid(file)
        meta = await _store(data, name, ctype, doc["user_id"])
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
        for_document=for_document or None,
        created_at=now,
    )
    await db.attachment_messages.insert_one(msg.model_dump())
    if msg.is_receipt:
        event = f"Receipt sent: {meta.filename}"
    elif for_document:
        event = f"{user['name']} sent missing document: {for_document}"
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
    if for_document:
        await db.attachments.update_one({"id": attachment_id}, {"$addToSet": {"missing_resolved": for_document}})
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


@router.post("/attachments/{attachment_id}/missing", response_model=AttachmentOut)
async def request_missing(attachment_id: str, body: MissingRequest, admin: dict = Depends(require_admin)):
    """Admin sets (or clears, with an empty list) the missing-documents checklist for this file."""
    doc = await _load_visible(attachment_id, admin)
    docs = list(dict.fromkeys(d.strip()[:120] for d in body.documents if d and d.strip()))
    note = body.note.strip()
    now = _now()
    if docs:
        text = "Please send these missing documents:\n" + "\n".join(f"• {d}" for d in docs)
        if note:
            text += f"\n\nNote: {note}"
        event = f"Missing documents requested ({len(docs)})"
    else:
        text = "Missing documents request cleared — nothing more is needed."
        event = "Missing documents request cleared"
    msg = MessageOut(
        id=str(uuid.uuid4()), attachment_id=attachment_id, sender_id=admin["id"], sender_name=admin["name"],
        sender_role="admin", text=text, file=None, is_receipt=False, created_at=now,
    )
    await db.attachment_messages.insert_one(msg.model_dump())
    prev_resolved = set(doc.get("missing_resolved") or [])
    changes = {
        "missing_documents": docs,
        "missing_resolved": [d for d in docs if d in prev_resolved],  # keep ticks for items still requested
        "last_event_at": now,
        "last_event_role": "admin",
        "last_event_text": event,
        "unread_user": True,
    }
    if not doc.get("seen_at"):
        changes["seen_at"] = now
    await db.attachments.update_one({"id": attachment_id}, {"$set": changes, "$inc": {"message_count": 1}})
    doc.update(changes)
    doc["message_count"] = doc.get("message_count", 0) + 1
    return _to_out(doc, "admin", now)


# ---------- Admin: delete files (attachment + its thread, stored files and alerts) ----------
async def _refund(doc: dict, reason: str, by: str) -> float:
    """Return this file's fee to the owner's wallet once — only while the work isn't finished (no receipt yet)."""
    fee = float(doc.get("fee_charged") or 0)
    if fee <= 0 or doc.get("fee_refunded") or doc.get("generated_at"):
        return 0
    claimed = await db.attachments.update_one(
        {"id": doc["id"], "fee_refunded": {"$ne": True}, "generated_at": None}, {"$set": {"fee_refunded": True}}
    )
    if claimed.modified_count == 0:
        return 0
    owner = await db.users.find_one({"id": doc["user_id"]}, {"_id": 0})
    if not owner:
        return 0
    await apply_txn(owner, "credit", fee, f"Refund: {doc.get('service_name') or 'file'} — {reason}", by,
                    attachment_id=doc["id"], category="refund", service_id=doc.get("service_id"))
    return fee


async def _purge(ids: list[str], by: str) -> tuple[int, float]:
    docs = await db.attachments.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
    if not docs:
        return 0, 0
    refunded = 0.0
    for d in docs:
        refunded += await _refund(d, "file deleted", by)
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
    return len(found), round(refunded, 2)


@router.delete("/attachments/{attachment_id}", response_model=DeleteResult)
async def delete_attachment(attachment_id: str, admin: dict = Depends(require_admin)):
    deleted, refunded = await _purge([attachment_id], admin["name"])
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return DeleteResult(deleted=1, refunded=refunded)


@router.post("/attachments/bulk-delete", response_model=DeleteResult)
async def bulk_delete(body: BulkDelete, admin: dict = Depends(require_admin)):
    deleted, refunded = await _purge(body.ids, admin["name"])
    return DeleteResult(deleted=deleted, refunded=refunded)


@router.post("/attachments/{attachment_id}/reject", response_model=AttachmentOut)
async def reject_attachment(attachment_id: str, body: RejectFileIn, admin: dict = Depends(require_admin)):
    """Admin rejects a submitted file: status → rejected, timer freezes, fee goes back to the user's wallet."""
    doc = await _load_visible(attachment_id, admin)
    if doc.get("generated_at"):
        raise HTTPException(status_code=409, detail="A receipt was already sent for this file")
    now = _now()
    claimed = await db.attachments.update_one(
        {"id": attachment_id, "rejected_at": None}, {"$set": {"rejected_at": now, "reject_reason": body.reason.strip()}}
    )
    if claimed.modified_count == 0:
        raise HTTPException(status_code=409, detail="This file was already rejected")
    doc.update(rejected_at=now, reject_reason=body.reason.strip())
    refunded = await _refund(doc, "file rejected", admin["name"])
    text = "This file was rejected."
    if body.reason.strip():
        text += f"\nReason: {body.reason.strip()}"
    if refunded:
        text += f"\n₹{refunded:g} has been returned to your wallet."
    msg = MessageOut(
        id=str(uuid.uuid4()), attachment_id=attachment_id, sender_id=admin["id"], sender_name=admin["name"],
        sender_role="admin", text=text, file=None, is_receipt=False, created_at=now,
    )
    await db.attachment_messages.insert_one(msg.model_dump())
    changes = {"last_event_at": now, "last_event_role": "admin", "unread_user": True,
               "last_event_text": "File rejected" + (f" · ₹{refunded:g} refunded" if refunded else "")}
    if not doc.get("seen_at"):
        changes["seen_at"] = now
    await db.attachments.update_one({"id": attachment_id}, {"$set": changes, "$inc": {"message_count": 1}})
    doc.update(changes, fee_refunded=bool(refunded) or doc.get("fee_refunded"))
    doc["message_count"] = doc.get("message_count", 0) + 1
    return _to_out(doc, "admin", now)


async def _charge_fee(user: dict, service: dict, count: int) -> float:
    """Take fee × files from the wallet on every submission (402 if too low). Returns the per-file fee charged."""
    fee = round(float(service.get("fee") or 0), 2)
    if fee <= 0 or count <= 0:
        return 0
    await apply_txn(user, "debit", fee * count, f"Fee: {service['name']} × {count}", "system",
                    category="fee", service_id=service["id"])
    return fee
