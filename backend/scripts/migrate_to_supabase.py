"""One-time copy of Sevakendra data from MongoDB into Supabase (run from this server only).

Uses the service-role key, which stays on this server and never goes into the website ZIP.
Safe to re-run: existing rows are upserted, existing auth users and storage files are skipped.
Usage:  python backend/scripts/migrate_to_supabase.py          (dry check)
        python backend/scripts/migrate_to_supabase.py --run    (copy)
"""

import base64
import os
import sys
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from gridfs import GridFS
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
OWNER_MOBILE, OWNER_EMAIL = "7396406422", "slm147733@gmail.com"
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
fs = GridFS(mdb, collection="uploads")
http = httpx.Client(timeout=60, headers=H)
RUN = "--run" in sys.argv


def iso(v):
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    if isinstance(v, dict):
        return {k: iso(x) for k, x in v.items() if k != "_id"}
    if isinstance(v, list):
        return [iso(x) for x in v]
    return v


def upsert(table, rows):
    if not rows or not RUN:
        print(f"  {table}: {len(rows)} rows" + ("" if RUN else " (dry)"))
        return
    r = http.post(f"{URL}/rest/v1/{table}", json=rows, headers={"Prefer": "resolution=merge-duplicates,return=minimal"})
    r.raise_for_status()
    print(f"  {table}: {len(rows)} rows copied")


def email_for(u):
    return OWNER_EMAIL if u["mobile"] == OWNER_MOBILE else f"{u['mobile']}@sevakendra.app"


def main():
    ok = http.get(f"{URL}/rest/v1/profiles?select=id&limit=1")
    if ok.status_code != 200:
        sys.exit("Supabase tables not found — run supabase/schema.sql in the SQL Editor first.")
    users = list(mdb.users.find({}, {"_id": 0}))
    print(f"users: {len(users)}")
    existing = {u["id"] for u in http.get(f"{URL}/auth/v1/admin/users?per_page=1000").json().get("users", [])}
    for u in users:
        if u["id"] in existing or not RUN:
            continue
        r = http.post(f"{URL}/auth/v1/admin/users", json={
            "id": u["id"], "email": email_for(u), "password_hash": u["password_hash"], "email_confirm": True,
            "user_metadata": {"name": u["name"]}})
        if r.status_code >= 300:
            sys.exit(f"auth user {u['mobile']}: {r.status_code} {r.text[:200]}")
        print(f"  auth user created for {u['mobile']} (same password)")
    upsert("profiles", [{
        "id": u["id"], "name": u["name"], "mobile": u["mobile"], "email": email_for(u), "role": u.get("role", "user"),
        "is_active": u.get("is_active", True), "created_at": iso(u["created_at"]), "last_login": iso(u.get("last_login")),
        "service_ids": u.get("service_ids") or [], "wallet_balance": round(float(u.get("wallet_balance") or 0), 2)} for u in users])

    # Files: GridFS → private bucket at "<owner user id>/<file id>-<name>"; docs keep the new path as file_id.
    paths = {}
    for f in fs.find():
        meta = f.metadata or {}
        owner = meta.get("owner_user_id") or "admin"
        safe = __import__("re").sub(r"[^A-Za-z0-9._-]+", "_", f.filename or "file")[-80:]
        path = f"{owner}/{f._id}-{safe}"
        paths[str(f._id)] = path
        if RUN:
            r = http.post(f"{URL}/storage/v1/object/uploads/{path}", content=f.read(),
                          headers={"Content-Type": meta.get("content_type") or "application/octet-stream", "x-upsert": "true"})
            if r.status_code >= 300:
                sys.exit(f"upload {path}: {r.status_code} {r.text[:200]}")
    print(f"files: {len(paths)}" + (" uploaded" if RUN else " (dry)"))

    def fix_file(d):
        f = d.get("file")
        if isinstance(f, dict) and f.get("file_id") in paths:
            f["file_id"] = paths[f["file_id"]]
        return d

    settings = []
    for s in mdb.settings.find({}, {"_id": 0}):
        key = s.pop("key")
        if key == "wallet" and s.get("qr_file_id"):  # QR shown to every user → inline it
            try:
                g = fs.get(__import__("bson").ObjectId(s["qr_file_id"]))
                s["qr_data_url"] = f"data:{(g.metadata or {}).get('content_type', 'image/png')};base64,{base64.b64encode(g.read()).decode()}"
            except Exception as ex:  # noqa: BLE001
                print("  QR image not copied:", ex)
        settings.append({"key": key, "doc": iso(s)})
    upsert("site_settings", settings)
    for name in ("pages", "links", "services"):
        upsert(name, [{"id": d["id"], "doc": iso(d)} for d in mdb[name].find({}, {"_id": 0})])
    atts = [fix_file(iso(d)) for d in mdb.attachments.find({}, {"_id": 0})]
    upsert("attachments", [{"id": d["id"], "user_id": d["user_id"], "doc": d, "created_at": d["created_at"]} for d in atts])
    owner_of = {d["id"]: d["user_id"] for d in atts}
    msgs = [fix_file(iso(d)) for d in mdb.attachment_messages.find({}, {"_id": 0}) if d["attachment_id"] in owner_of]
    upsert("attachment_messages", [{"id": d["id"], "attachment_id": d["attachment_id"], "owner_id": owner_of[d["attachment_id"]],
                                    "doc": d, "created_at": d["created_at"]} for d in msgs])
    for name in ("wallet_transactions", "wallet_requests", "whatsapp_alerts"):
        upsert(name, [{"id": d["id"], "user_id": d["user_id"], "doc": d, "created_at": d["created_at"]}
                      for d in (iso(x) for x in mdb[name].find({}, {"_id": 0})) if d.get("user_id")])
    print("done" if RUN else "dry check finished — add --run to copy")


if __name__ == "__main__":
    main()
