#!/usr/bin/env python3
"""Generate Marrow Cline's shady goods catalog and item art."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "shop-catalogs"
IMG_DIR = ROOT / "assets" / "items" / "shady"
MODULE_IMG = "modules/townforge/assets/items/shady"

TOPIC_STYLES = {
    "infiltration": ("#2a3a4a", "#b8d0e8", "🗝"),
    "tools": ("#3a3a2a", "#e8e0b8", "🕯"),
    "documents": ("#4a3a2a", "#f0dcc0", "📜"),
    "restraints": ("#3a2a2a", "#e8c8c8", "⛓"),
    "disguise": ("#3a2a4a", "#dcc8f0", "🎭"),
    "poison": ("#2a4a2a", "#c8f0c8", "☠"),
    "gear": ("#4a4a4a", "#d8d8d8", "🗡"),
}

GOODS = [
    (
        "Debt-Marker Chalk",
        "infiltration",
        12,
        "A stub of gray chalk Marrow's collectors use to mark doors without alarming honest folk.",
        "When you tail a creature that passed a chalk mark you made within the past hour, you gain a +2 bonus to your next Dexterity (Stealth) check.",
    ),
    (
        "Velvet Pouch of Quiet Coins",
        "tools",
        18,
        "A lined pouch that muffles coin clatter—popular with gamblers and pickpockets alike.",
        "You have advantage on your next Dexterity (Sleight of Hand) check made to palm, plant, or swap a coin-sized object.",
    ),
    (
        "Forged Release Stub",
        "documents",
        35,
        "A convincingly stamped bail chit copied from the magistrate's outer office.",
        "Within the next hour, you gain a +1 bonus to your next Charisma (Deception) check made while posing as a courier, clerk, or debt collector.",
    ),
]


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:64]


def svg_icon(item_id: str, title: str, topic: str) -> str:
    fill, accent, mark = TOPIC_STYLES[topic]
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;")
    words = safe_title.split()
    line1 = " ".join(words[:3])
    line2 = " ".join(words[3:6]) if len(words) > 3 else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="{safe_title}">
  <defs>
    <linearGradient id="g-{item_id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{accent}"/>
      <stop offset="100%" stop-color="{fill}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="18" fill="#101014"/>
  <rect x="44" y="52" width="168" height="152" rx="12" fill="url(#g-{item_id})" stroke="{accent}" stroke-width="4"/>
  <text x="128" y="118" text-anchor="middle" font-size="42">{mark}</text>
  <text x="128" y="168" text-anchor="middle" fill="{accent}" font-family="Georgia, serif" font-size="14" font-weight="700">{line1}</text>
  <text x="128" y="188" text-anchor="middle" fill="{accent}" font-family="Georgia, serif" font-size="12">{line2}</text>
  <text x="128" y="236" text-anchor="middle" fill="{accent}" font-size="10" opacity="0.85">{topic.upper()}</text>
</svg>
'''


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    goods = []
    for title, topic, price_gp, blurb, passive in GOODS:
        item_id = slugify(title)
        img_path = IMG_DIR / f"{item_id}.svg"
        img_path.write_text(svg_icon(item_id, title, topic), encoding="utf-8")
        goods.append(
            {
                "id": item_id,
                "name": title,
                "topic": topic,
                "priceGP": price_gp,
                "description": blurb,
                "passive": passive,
                "img": f"{MODULE_IMG}/{item_id}.svg",
            }
        )

    catalog = {
        "id": "marrow-cline",
        "npcId": "marrow-cline",
        "shopType": "shady-lender",
        "catalogKind": "shady",
        "shopName": "Suspicious Items Lender",
        "label": "Marrow Cline — Suspicious Items",
        "catalogOnly": True,
        "shadyGoods": goods,
    }

    out_file = OUT_DIR / "marrow-cline.json"
    out_file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest.get("catalogs", [])
    if not any(entry.get("npcId") == "marrow-cline" for entry in entries):
        entries.append({"npcId": "marrow-cline", "file": "marrow-cline.json"})
    manifest["catalogs"] = entries
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(goods)} shady goods to {out_file}")


if __name__ == "__main__":
    main()
