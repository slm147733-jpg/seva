"""Export saved logins + site setup into seed.json for the plain static (Hostinger) build.

Passwords are copied as their existing bcrypt hashes (never as plain text). Customer documents, chats and
file records are NOT exported: seed.json is publicly downloadable from a static site.
Usage: python backend/scripts/export_static_seed.py <output seed.json>
"""

import base64
import json
import os
import sys
from datetime import datetime, timezone

from bson import ObjectId
from dotenv import load_dotenv
from gridfs import GridFS
from pymongo import MongoClient

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
fs = GridFS(mdb, collection="uploads")


def iso(v):
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    if isinstance(v, dict):
        return {k: iso(x) for k, x in v.items() if k != "_id"}
    if isinstance(v, list):
        return [iso(x) for x in v]
    return v


def main(out):
    users = list(mdb.users.find({}, {"_id": 0}))
    profiles = [{
        "id": u["id"], "name": u["name"], "mobile": u["mobile"], "email": f"{u['mobile']}@sevakendra.app",
        "role": u.get("role", "user"), "is_active": u.get("is_active", True), "created_at": iso(u["created_at"]),
        "last_login": iso(u.get("last_login")), "service_ids": u.get("service_ids") or [],
        "wallet_balance": round(float(u.get("wallet_balance") or 0), 2), "password_hash": u["password_hash"]} for u in users]
    settings = []
    for s in mdb.settings.find({}, {"_id": 0}):
        key = s.pop("key")
        if key == "wallet" and s.get("qr_file_id"):
            g = fs.get(ObjectId(s["qr_file_id"]))
            s["qr_data_url"] = f"data:{(g.metadata or {}).get('content_type', 'image/png')};base64,{base64.b64encode(g.read()).decode()}"
        settings.append({"key": key, "doc": iso(s)})
    tables = {"profiles": profiles, "site_settings": settings}
    for name in ("pages", "links", "services"):
        tables[name] = [{"id": d["id"], "doc": iso(d)} for d in mdb[name].find({}, {"_id": 0})]
    for name in ("wallet_transactions", "wallet_requests"):
        tables[name] = [{"id": d["id"], "user_id": d["user_id"], "doc": d, "created_at": d["created_at"]}
                        for d in (iso(x) for x in mdb[name].find({}, {"_id": 0})) if d.get("user_id")]
    with open(out, "w") as f:
        json.dump({"exported_at": iso(datetime.now(timezone.utc)), "tables": tables}, f)
    print(f"seed written: {len(profiles)} logins, " + ", ".join(f"{k} {len(v)}" for k, v in tables.items()))


if __name__ == "__main__":
    main(sys.argv[1])
