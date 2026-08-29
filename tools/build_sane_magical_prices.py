#!/usr/bin/env python3
"""Build data/sane-magical-prices.json from Saidoro's Sane Magical Prices PDF."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "uploads" / "Sane_Magical_Prices.pdf"
OUT_PATH = ROOT / "data" / "sane-magical-prices.json"
FALLBACK_PDF = Path("/home/ubuntu/.cursor/projects/workspace/uploads/Sane_Magical_Prices_85ce.pdf")

RARITY = r"(?:Common|Uncommon|Rare|Very Rare|Legendary)"


def parse_pdf_text(text: str) -> dict[str, int]:
    start = text.find("All Items Listed Alphabetically")
    end = text.find("Items that Won", start)
    if start < 0:
        raise RuntimeError("Could not find alphabetical item list in PDF")
    section = text[start : end if end > 0 else len(text)]
    lines = [line.strip() for line in section.splitlines() if line.strip()]

    full_re = re.compile(rf"^(.+?)\s+(\d+)\s+(\d+)\s+{RARITY}\s*$")
    tail_re = re.compile(rf"^(\d+)\s+(\d+)\s+{RARITY}\s*$")

    items: dict[str, int] = {}
    pending: list[str] = []
    for line in lines:
        if line.startswith("All Items") or line == "Name Price Page Rarity":
            continue
        match = full_re.match(line)
        if match:
            name = " ".join(pending + [match.group(1).strip()])
            pending = []
            items[normalize_key(name)] = int(match.group(2))
            continue
        match = tail_re.match(line)
        if match and pending:
            name = " ".join(pending)
            pending = []
            items[normalize_key(name)] = int(match.group(1))
            continue
        pending.append(line)

    items.update(
        {
            f"spell scroll level {level}": price
            for level, price in {
                0: 10,
                1: 60,
                2: 120,
                3: 200,
                4: 320,
                5: 640,
                6: 1280,
                7: 2560,
                8: 5120,
                9: 10240,
            }.items()
        }
    )
    items["ammunition +2 (ea)"] = 100
    items["goldean lion (ea)"] = 600
    return items


def normalize_key(name: str) -> str:
    return re.sub(r"\s+", " ", name.replace("’", "'").strip().lower())


def main() -> None:
    pdf_path = PDF_PATH if PDF_PATH.exists() else FALLBACK_PDF
    if not pdf_path.exists():
        raise SystemExit(f"PDF not found: {pdf_path}")

    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    items = parse_pdf_text(text)

    payload = {
        "version": 1,
        "source": "Saidoro's Sane Magical Prices",
        "items": dict(sorted(items.items(), key=lambda entry: entry[0])),
    }
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(items)} prices to {OUT_PATH}")


if __name__ == "__main__":
    main()
