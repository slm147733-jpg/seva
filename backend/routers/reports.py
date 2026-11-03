"""Admin daily work report + WhatsApp alert log."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from lib.auth import require_admin
from lib.db import db
from models.report import DailyReport, DayRow, MonthIncome, MonthlyIncome, ServiceIncome, StatusCounts, WhatsAppAlert

router = APIRouter(prefix="/admin", tags=["reports"], dependencies=[Depends(require_admin)])
IST = ZoneInfo("Asia/Kolkata")
PROCESSING_AFTER = timedelta(minutes=1)


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def _day(dt) -> str:
    return _utc(dt).astimezone(IST).strftime("%Y-%m-%d")


@router.get("/reports/daily", response_model=DailyReport)
async def daily_report(days: int = Query(14, ge=1, le=90), service_id: str | None = Query(None)):
    now = datetime.now(timezone.utc)
    today = now.astimezone(IST).date()
    keys = [(today - timedelta(days=i)).isoformat() for i in range(days)]
    received, seen, generated, rejected = defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(int)
    durations: dict[str, list[float]] = defaultdict(list)
    counts = {"not_started": 0, "seen": 0, "processing": 0, "generated": 0, "rejected": 0}
    all_durations: list[float] = []

    query = {"service_id": service_id} if service_id else {}
    docs = await db.attachments.find(query, {"_id": 0, "created_at": 1, "seen_at": 1, "generated_at": 1, "rejected_at": 1}).to_list(100000)
    for d in docs:
        created, s, g = _utc(d["created_at"]), _utc(d.get("seen_at")), _utc(d.get("generated_at"))
        rj = _utc(d.get("rejected_at"))
        received[_day(created)] += 1
        if s:
            seen[_day(s)] += 1
        if rj:
            rejected[_day(rj)] += 1
            counts["rejected"] += 1
        elif g:
            generated[_day(g)] += 1
            mins = (g - created).total_seconds() / 60  # timer runs from submission, same as on screen
            durations[_day(g)].append(mins)
            all_durations.append(mins)
            counts["generated"] += 1
        elif s:
            counts["processing" if now >= s + PROCESSING_AFTER else "seen"] += 1
        else:
            counts["not_started"] += 1

    # Wallet money per IST day: fees taken at submit, refunds given back on delete/reject.
    fees, refunds = defaultdict(float), defaultdict(float)
    start = datetime.combine(today - timedelta(days=days - 1), datetime.min.time(), IST).astimezone(timezone.utc)
    tq: dict = {"created_at": {"$gte": start}, "$or": [
        {"category": {"$in": ["fee", "refund"]}},
        {"category": {"$exists": False}, "type": "debit", "created_by": "system", "reason": {"$regex": "^Fee:"}},  # older fee rows
    ]}
    if service_id:
        tq["service_id"] = service_id
    async for t in db.wallet_transactions.find(tq, {"_id": 0, "category": 1, "amount": 1, "created_at": 1}):
        (refunds if t.get("category") == "refund" else fees)[_day(t["created_at"])] += t["amount"]
    r2 = lambda x: round(x, 2)  # noqa: E731

    def avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    return DailyReport(
        today=today.isoformat(),
        days=[DayRow(date=k, received=received[k], seen=seen[k], generated=generated[k], avg_minutes=avg(durations[k]),
                     rejected=rejected[k], fees_collected=r2(fees[k]), refunds=r2(refunds[k]), net_fees=r2(fees[k] - refunds[k]))
              for k in keys],
        current=StatusCounts(**counts),
        total_received=len(docs),
        total_generated=counts["generated"],
        avg_minutes=avg(all_durations),
        total_fees_collected=r2(sum(fees[k] for k in keys)),
        total_refunds=r2(sum(refunds[k] for k in keys)),
        total_net_fees=r2(sum(fees[k] - refunds[k] for k in keys)),
    )


@router.get("/reports/monthly-income", response_model=MonthlyIncome)
async def monthly_income(months: int = Query(6, ge=1, le=24)):
    """Wallet fees and refunds per IST month, broken down by service."""
    today = datetime.now(timezone.utc).astimezone(IST).date()
    y, m = today.year, today.month
    keys = []
    for _ in range(months):
        keys.append(f"{y:04d}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    start = datetime(int(keys[-1][:4]), int(keys[-1][5:]), 1, tzinfo=IST).astimezone(timezone.utc)
    q = {"created_at": {"$gte": start}, "$or": [
        {"category": {"$in": ["fee", "refund"]}},
        {"category": {"$exists": False}, "type": "debit", "created_by": "system", "reason": {"$regex": "^Fee:"}},
    ]}
    agg: dict = defaultdict(lambda: {"fees": 0.0, "refunds": 0.0, "files": 0})
    legacy_names: dict[str, str] = {}
    async for t in db.wallet_transactions.find(q, {"_id": 0}):
        month = _utc(t["created_at"]).astimezone(IST).strftime("%Y-%m")
        sid = t.get("service_id")
        if not sid:  # older fee rows: recover the service name from the reason text "Fee: <name> × <n>"
            name = t.get("reason", "")[4:].rsplit(" × ", 1)[0].strip() or "Other"
            sid = f"legacy:{name}"
            legacy_names[sid] = name
        row = agg[(month, sid)]
        if t.get("category") == "refund":
            row["refunds"] += t["amount"]
        else:
            row["fees"] += t["amount"]
            try:
                row["files"] += int(t.get("reason", "").rsplit("× ", 1)[1])
            except (IndexError, ValueError):
                row["files"] += 1
    real_ids = {sid for (_, sid) in agg if not sid.startswith("legacy:")}
    names = {s["id"]: s["name"] async for s in db.services.find({"id": {"$in": list(real_ids)}}, {"_id": 0, "id": 1, "name": 1})}
    missing = real_ids - names.keys()
    if missing:  # deleted services: fall back to the name snapshotted on their files
        async for a in db.attachments.find({"service_id": {"$in": list(missing)}}, {"_id": 0, "service_id": 1, "service_name": 1}):
            names.setdefault(a["service_id"], a.get("service_name") or "Deleted service")
    # Merge legacy rows into a real service with the same name when one exists.
    by_name = {v: k for k, v in names.items()}
    merged: dict = defaultdict(lambda: {"fees": 0.0, "refunds": 0.0, "files": 0})
    for (month, sid), v in agg.items():
        key = by_name.get(legacy_names[sid], sid) if sid in legacy_names else sid
        for f in ("fees", "refunds", "files"):
            merged[(month, key)][f] += v[f]
    out = []
    for k in keys:
        rows = [
            ServiceIncome(
                service_id=None if sid.startswith("legacy:") else sid,
                service_name=legacy_names.get(sid) or names.get(sid, "Deleted service"),
                files=v["files"], fees_collected=round(v["fees"], 2), refunds=round(v["refunds"], 2),
                net=round(v["fees"] - v["refunds"], 2),
            )
            for (month, sid), v in merged.items() if month == k
        ]
        rows.sort(key=lambda r: r.net, reverse=True)
        fees = round(sum(r.fees_collected for r in rows), 2)
        refunds = round(sum(r.refunds for r in rows), 2)
        out.append(MonthIncome(month=k, fees_collected=fees, refunds=refunds, net=round(fees - refunds, 2), services=rows))
    return MonthlyIncome(months=out)


@router.get("/whatsapp-alerts", response_model=list[WhatsAppAlert])
async def whatsapp_alerts():
    docs = await db.whatsapp_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [WhatsAppAlert(**d) for d in docs]
