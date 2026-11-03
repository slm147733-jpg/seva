"""Admin daily work report + WhatsApp alert log."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from lib.auth import require_admin
from lib.db import db
from models.report import DailyReport, DayRow, StatusCounts, WhatsAppAlert

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


@router.get("/whatsapp-alerts", response_model=list[WhatsAppAlert])
async def whatsapp_alerts():
    docs = await db.whatsapp_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [WhatsAppAlert(**d) for d in docs]
