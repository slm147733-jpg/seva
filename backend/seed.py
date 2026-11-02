"""Idempotent seed: default site settings, pages, quick links and the owner admin account."""

import asyncio
import uuid
from datetime import datetime, timezone

from lib.auth import hash_password
from lib.db import db, ensure_indexes

ADMIN_MOBILE = "7396406422"
ADMIN_PASSWORD = "Raju@14773"
from models.content import Link, Page, Settings

PAGES = [
    Page(title="About Us", slug="about", order=1,
         excerpt="Who we are and why Sevakendra exists.",
         content="Sevakendra is a neighbourhood digital service centre.\n\nWe help citizens apply for, track and receive government and utility services without long queues or confusion.\n\nOur trained operators guide you step by step."),
    Page(title="Services", slug="services", order=2,
         excerpt="Everything we can help you with.",
         content="- Aadhaar updates & PAN applications\n- Certificates: income, caste, residence\n- Bill payments: electricity, water, gas\n- Pension & scholarship applications\n- Online form filling and printing"),
    Page(title="Contact", slug="contact", order=3,
         excerpt="Reach our centre.",
         content="Visit us Monday to Saturday, 9:30 AM – 6:30 PM.\n\nCall our helpline or drop by the centre — we are happy to help."),
]

LINKS = [
    Link(title="Aadhaar Services (UIDAI)", url="https://uidai.gov.in", category="Identity", description="Update, download & verify Aadhaar", order=1),
    Link(title="PAN Card (Income Tax)", url="https://www.incometax.gov.in", category="Identity", description="Apply or link PAN", order=2),
    Link(title="DigiLocker", url="https://www.digilocker.gov.in", category="Documents", description="Store official documents digitally", order=3),
    Link(title="National Scholarship Portal", url="https://scholarships.gov.in", category="Education", description="Scholarship applications", audience="users", order=4),
]


async def main() -> None:
    await ensure_indexes()
    if not await db.settings.find_one({"key": "site"}):
        await db.settings.insert_one({"key": "site", **Settings(helpline="1800-000-0000", email="help@sevakendra.in", address="Main Road, Near Bus Stand").model_dump()})
    for p in PAGES:
        await db.pages.update_one({"slug": p.slug}, {"$setOnInsert": p.model_dump()}, upsert=True)
    for link in LINKS:
        await db.links.update_one({"title": link.title}, {"$setOnInsert": link.model_dump()}, upsert=True)
    # Owner admin account (login at /login).
    now = datetime.now(timezone.utc)
    await db.users.update_one(
        {"mobile": ADMIN_MOBILE},
        {
            "$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin", "is_active": True},
            "$setOnInsert": {"id": str(uuid.uuid4()), "name": "Raju", "created_at": now, "last_login": None},
        },
        upsert=True,
    )
    print("seeded")


if __name__ == "__main__":
    asyncio.run(main())
