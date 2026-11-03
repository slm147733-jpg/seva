"""Offline receipt reading: pull the application / acknowledgement number and the applicant name from a receipt.

PDFs with a text layer are read directly (keeps spaces). Scanned PDFs and photos go through RapidOCR (ONNX, no internet).
"""

import io
import logging
import re
from typing import Optional

import fitz  # pymupdf
import numpy as np
from PIL import Image

log = logging.getLogger(__name__)
_engine = None


def _ocr():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR  # heavy import, load on first use

        _engine = RapidOCR()
    return _engine


def _ocr_image(img: Image.Image) -> list[str]:
    img = img.convert("RGB")
    if max(img.size) > 2200:  # keep OCR fast on big phone photos
        img.thumbnail((2200, 2200))
    result, _ = _ocr()(np.array(img))
    return [r[1] for r in (result or [])]


def read_lines(data: bytes, content_type: str) -> list[str]:
    if content_type == "application/pdf":
        doc = fitz.open(stream=data, filetype="pdf")
        lines: list[str] = []
        for page in list(doc)[:3]:
            text = page.get_text()
            if len(text.strip()) > 20:
                lines += [ln for ln in text.splitlines() if ln.strip()]
            else:  # scanned page
                pix = page.get_pixmap(dpi=200)
                lines += _ocr_image(Image.open(io.BytesIO(pix.tobytes("png"))))
        return lines
    return _ocr_image(Image.open(io.BytesIO(data)))


# Labels seen on MeeSeva / e-District / UIDAI / NSDL style receipts. OCR often drops spaces, hence the \s*.
_NUM_LABEL = re.compile(
    r"(?:application|appln|appl|acknowledge?ment|acknowledgement|ack|enrol(?:l)?ment|enrolment|request|reference|ref|urn|token|receipt)"
    r"\s*(?:no|number|num|id|#)?\.?\s*(?:[:：\-=]|is)?\s*",
    re.I,
)
_VALUE = re.compile(r"([A-Z0-9][A-Z0-9/\-]{4,39})", re.I)
_NAME_LABEL = re.compile(r"(?:applicant|citizen|customer|candidate|resident|beneficiary)?\s*'?s?\s*name\s*(?:of\s*the\s*applicant)?\s*[:：\-=]\s*", re.I)
_SKIP_NAMES = re.compile(r"^(father|mother|husband|guardian|s/o|d/o|w/o|c/o)", re.I)


def _has_digit(s: str) -> bool:
    return any(c.isdigit() for c in s)


def parse(lines: list[str]) -> tuple[Optional[str], Optional[str]]:
    number = name = None
    for i, raw in enumerate(lines):
        line = raw.strip()
        if number is None:
            m = _NUM_LABEL.search(line)
            if m:
                rest = line[m.end():].strip() or (lines[i + 1].strip() if i + 1 < len(lines) else "")
                v = _VALUE.search(rest)
                if v and _has_digit(v.group(1)) and sum(c.isdigit() for c in v.group(1)) >= 4:
                    number = v.group(1).strip("-/").upper()
        if name is None and not _SKIP_NAMES.search(line):
            m = _NAME_LABEL.search(line)
            if m and not re.search(r"father|mother|husband|guardian", line[: m.start() + 12], re.I):
                rest = line[m.end():].strip() or (lines[i + 1].strip() if i + 1 < len(lines) else "")
                rest = re.split(r"\s{2,}|\b(?:father|s/o|d/o|w/o|age|gender|mobile|date|dob)\b", rest, flags=re.I)[0]
                rest = re.sub(r"[^A-Za-z .]", "", rest).strip(" .")
                if 2 <= len(rest) <= 60:
                    name = rest.upper()
        if number and name:
            break
    return number, name


def read_receipt(data: bytes, content_type: str) -> tuple[Optional[str], Optional[str]]:
    try:
        return parse(read_lines(data, content_type))
    except Exception:  # unreadable file — caller records "failed"
        log.exception("receipt OCR failed")
        raise
