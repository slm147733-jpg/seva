"""Monthly income-by-service PDF for accounts (reportlab). Base fonts have no ₹ glyph, so amounts print as 'Rs.'."""

import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from models.report import MonthIncome

ORANGE = colors.HexColor("#EA580C")
AMBER = colors.HexColor("#FEF3C7")
STONE = colors.HexColor("#57534E")


def _rs(n: float) -> str:
    whole, frac = f"{abs(n):.2f}".split(".")
    # Indian grouping: last 3 digits, then pairs
    head, tail = whole[:-3], whole[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    body = ",".join(groups + [tail]) if groups else tail
    return f"{'-' if n < 0 else ''}Rs. {body}" + ("" if frac == "00" else f".{frac}")


def render_month_pdf(m: MonthIncome, site_name: str, generated_at: datetime) -> bytes:
    buf = io.BytesIO()
    label = datetime.strptime(m.month, "%Y-%m").strftime("%B %Y")
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
                            title=f"{site_name} income by service - {label}")
    ss = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=ss["Title"], alignment=0, textColor=ORANGE, fontSize=20, spaceAfter=2)
    sub = ParagraphStyle("s", parent=ss["Normal"], textColor=STONE, fontSize=10)
    cell = ParagraphStyle("c", parent=ss["Normal"], fontSize=10, leading=12)

    story = [
        Paragraph(site_name, h),
        Paragraph(f"<b>Monthly income by service</b> &mdash; {label}", ParagraphStyle("t", parent=ss["Heading2"], spaceBefore=0)),
        Paragraph(f"Wallet fees collected minus refunds. Generated {generated_at.strftime('%d %b %Y, %I:%M %p')} (IST).", sub),
        Spacer(1, 8 * mm),
    ]

    summary = Table(
        [["Fees collected", "Refunded", "Net income"], [_rs(m.fees_collected), _rs(m.refunds), _rs(m.net)]],
        colWidths=[58 * mm] * 3,
    )
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), AMBER),
        ("TEXTCOLOR", (0, 0), (-1, 0), STONE),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
        ("LINEAFTER", (0, 0), (1, -1), 0.5, colors.white),
    ]))
    story += [summary, Spacer(1, 8 * mm)]

    rows = [["#", "Service", "Files charged", "Fees collected", "Refunded", "Net income"]]
    for i, s in enumerate(m.services, 1):
        rows.append([str(i), Paragraph(s.service_name, cell), str(s.files), _rs(s.fees_collected), _rs(s.refunds), _rs(s.net)])
    if not m.services:
        rows.append(["", "No fees collected this month", "", "", "", ""])
    rows.append(["", "Total", str(sum(s.files for s in m.services)), _rs(m.fees_collected), _rs(m.refunds), _rs(m.net)])
    t = Table(rows, colWidths=[8 * mm, 60 * mm, 22 * mm, 30 * mm, 26 * mm, 28 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ORANGE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#FAFAF9")]),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.HexColor("#E7E5E4")),
        ("LINEABOVE", (0, -1), (-1, -1), 1, STONE),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    doc.build(story)
    return buf.getvalue()
