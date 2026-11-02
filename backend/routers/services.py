"""Services (work types like "PAN card"). Admin manages them and assigns them per user; users only see their own."""

import re

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, require_admin
from lib.db import db
from models.service import Service, ServiceIn
from models.user import Ok

router = APIRouter(tags=["services"])


async def _with_counts(docs: list[dict]) -> list[Service]:
    out = []
    for d in docs:
        d["user_count"] = await db.users.count_documents({"service_ids": d["id"]})
        out.append(Service(**d))
    return out


async def _name_taken(name: str, exclude_id: str | None = None) -> bool:
    query: dict = {"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    return await db.services.find_one(query) is not None


@router.get("/admin/services", response_model=list[Service], dependencies=[Depends(require_admin)])
async def list_services():
    docs = await db.services.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return await _with_counts(docs)


@router.post("/admin/services", response_model=Service, status_code=201, dependencies=[Depends(require_admin)])
async def create_service(body: ServiceIn):
    name = body.name.strip()
    if await _name_taken(name):
        raise HTTPException(status_code=409, detail="A service with this name already exists")
    svc = Service(**{**body.model_dump(), "name": name})
    await db.services.insert_one(svc.model_dump(exclude={"user_count"}))
    return svc


@router.put("/admin/services/{service_id}", response_model=Service, dependencies=[Depends(require_admin)])
async def update_service(service_id: str, body: ServiceIn):
    name = body.name.strip()
    if await _name_taken(name, service_id):
        raise HTTPException(status_code=409, detail="A service with this name already exists")
    doc = await db.services.find_one_and_update(
        {"id": service_id}, {"$set": {**body.model_dump(), "name": name}}, projection={"_id": 0}, return_document=True
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Service not found")
    return (await _with_counts([doc]))[0]


@router.delete("/admin/services/{service_id}", response_model=Ok, dependencies=[Depends(require_admin)])
async def delete_service(service_id: str):
    res = await db.services.delete_one({"id": service_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    # Unassign from everyone; existing files keep their stored service name.
    await db.users.update_many({"service_ids": service_id}, {"$pull": {"service_ids": service_id}})
    return Ok()


@router.get("/services/mine", response_model=list[Service])
async def my_services(user: dict = Depends(current_user)):
    ids = user.get("service_ids") or []
    if not ids:
        return []
    docs = await db.services.find({"id": {"$in": ids}, "is_active": True}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [Service(**d) for d in docs]


async def assignable_service(user: dict, service_id: str) -> dict:
    """The service must exist, be active, and be assigned to this user (403 otherwise)."""
    if service_id not in (user.get("service_ids") or []):
        raise HTTPException(status_code=403, detail="This service is not assigned to you. Please contact the admin.")
    svc = await db.services.find_one({"id": service_id, "is_active": True}, {"_id": 0})
    if not svc:
        raise HTTPException(status_code=403, detail="This service is not available right now.")
    return svc


async def valid_service_ids(ids: list[str]) -> list[str]:
    if not ids:
        return []
    found = await db.services.find({"id": {"$in": list(set(ids))}}, {"id": 1}).to_list(1000)
    return [d["id"] for d in found]
