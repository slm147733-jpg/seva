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
async def daily_report(days: int = Query(14, ge=1, le=90)):
    now = datetime.now(timezone.utc)
    today = now.astimezone(IST).date()
    keys = [(today - timedelta(days=i)).isoformat() for i in range(days)]
    received, seen, generated = defaultdict(int), defaultdict(int), defaultdict(int)
    durations: dict[str, list[float]] = defaultdict(list)
    counts = {"not_started": 0, "seen": 0, "processing": 0, "generated": 0}
    all_durations: list[float] = []

    docs = await db.attachments.find({}, {"_id": 0, "created_at": 1, "seen_at": 1, "generated_at": 1}).to_list(100000)
    for d in docs:
        created, s, g = _utc(d["created_at"]), _utc(d.get("seen_at")), _utc(d.get("generated_at"))
        received[_day(created)] += 1
        if s:
            seen[_day(s)] += 1
        if g:
            generated[_day(g)] += 1
            proc = s + PROCESSING_AFTER if s else None
            start = proc if proc and proc < g else (s or created)  # same rule as the on-screen timer
            mins = (g - start).total_seconds() / 60
            durations[_day(g)].append(mins)
            all_durations.append(mins)
            counts["generated"] += 1
        elif s:
            counts["processing" if now >= s + PROCESSING_AFTER else "seen"] += 1
        else:
            counts["not_started"] += 1

    def avg(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    return DailyReport(
        today=today.isoformat(),
        days=[DayRow(date=k, received=received[k], seen=seen[k], generated=generated[k], avg_minutes=avg(durations[k])) for k in keys],
        current=StatusCounts(**counts),
        total_received=len(docs),
        total_generated=counts["generated"],
        avg_minutes=avg(all_durations),
    )


@router.get("/whatsapp-alerts", response_model=list[WhatsAppAlert])
async def whatsapp_alerts():
    docs = await db.whatsapp_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return [WhatsAppAlert(**d) for d in docs]
