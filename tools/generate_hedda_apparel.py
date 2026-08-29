#!/usr/bin/env python3
"""Generate Hedda Loom's custom apparel catalog and item art."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "shop-catalogs"
IMG_DIR = ROOT / "assets" / "items" / "apparel"
MODULE_IMG = "modules/townforge/assets/items/apparel"

TOPIC_STYLES = {
    "jewelry": ("#6b4a5a", "#f0d0e0", "💎"),
    "footwear": ("#4a4a3a", "#e8e0c8", "👢"),
    "gloves": ("#5a4a3a", "#e8d8c0", "🧤"),
    "outerwear": ("#3a4a5a", "#d0e0f0", "🧥"),
    "accessories": ("#4a3a5a", "#e0d0f0", "🎭"),
    "formal": ("#2a3a4a", "#d8e8ff", "👗"),
    "workwear": ("#5a4a2a", "#f0e0b8", "🧵"),
    "clothing": ("#4a5a4a", "#d8f0d8", "👔"),
}

APPAREL = [
    (
        "Moonthread Stud Earrings",
        "jewelry",
        18,
        "Tiny silver studs threaded with pale blue silk from Hedda's midnight loom.",
        "Within the next hour, you gain a +1 bonus to your next Charisma (Performance) check.",
    ),
    (
        "Courtiers Pearl Necklace",
        "jewelry",
        45,
        "A single freshwater pearl on a braided cord favored by discreet nobles.",
        "When making a Charisma (Persuasion) check at court or a formal gathering, you may roll the check with advantage once.",
    ),
    (
        "Fleetfoot Wool Socks",
        "footwear",
        3,
        "Soft wool socks with reinforced heels for long market days.",
        "For 10 minutes after donning, your walking speed increases by 5 feet.",
    ),
    (
        "Cobblers Road Shoes",
        "footwear",
        8,
        "Sturdy leather shoes with hobnailed soles for cobbled streets and country paths.",
        "For 1 hour, difficult terrain composed of rubble, stones, or unpaved roads doesn't cost you extra movement.",
    ),
    (
        "Scandal Sleeve Gloves",
        "gloves",
        12,
        "Fitted gloves in last season's scandalous sleeve pattern—too bold for some parlors.",
        "Within the next hour, you gain a +2 bonus to your next Dexterity (Sleight of Hand) check.",
    ),
    (
        "Whisper-Linen Shawl",
        "outerwear",
        15,
        "Pale linen dyed to fade into festival crowds and evening mist.",
        "Once before your next long rest, you have advantage on a Dexterity (Stealth) check made in a crowd or busy street.",
    ),
    (
        "Loom-Warden Work Apron",
        "workwear",
        6,
        "Heavy canvas apron with pockets for pins, chalk, and measuring cord.",
        "Within the next hour, you gain a +1 bonus to your next Intelligence (Investigation) check made to examine fabric, clothing, or disguises.",
    ),
    (
        "Silk Mask of the Masque",
        "accessories",
        10,
        "A half-mask of dyed silk tied with satin ribbons for masked balls.",
        "Within the next hour, you gain a +1 bonus to your next Charisma (Deception) check.",
    ),
    (
        "Heddas Lucky Hairpin",
        "jewelry",
        22,
        "A brass hairpin shaped like a weaver's shuttle—Hedda's own good-luck charm.",
        "When you fail a Charisma saving throw, you can reroll the save and must use the new roll. Once used, the hairpin loses this property until you finish a long rest.",
    ),
    (
        "Mourning Black Cloak Pin",
        "accessories",
        14,
        "A jet cloak pin polished until it drinks the light—popular for secret mourning orders.",
        "Within the next hour, you gain a +2 bonus to your next Charisma (Intimidation) check.",
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
  <rect width="256" height="256" rx="18" fill="#121418"/>
  <rect x="36" y="48" width="184" height="160" rx="14" fill="url(#g-{item_id})" stroke="{accent}" stroke-width="4"/>
  <text x="128" y="118" text-anchor="middle" font-size="42">{mark}</text>
  <text x="128" y="168" text-anchor="middle" fill="{accent}" font-family="Georgia, serif" font-size="14" font-weight="700">{line1}</text>
  <text x="128" y="188" text-anchor="middle" fill="{accent}" font-family="Georgia, serif" font-size="12">{line2}</text>
  <text x="128" y="236" text-anchor="middle" fill="{accent}" font-size="10" opacity="0.85">{topic.upper()}</text>
</svg>
'''


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    pieces = []
    for title, topic, price_gp, blurb, passive in APPAREL:
        item_id = slugify(title)
        img_path = IMG_DIR / f"{item_id}.svg"
        img_path.write_text(svg_icon(item_id, title, topic), encoding="utf-8")
        pieces.append(
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
        "id": "hedda-loom",
        "npcId": "hedda-loom",
        "shopType": "tailor",
        "catalogKind": "apparel",
        "shopName": "Hedda Loom — Clothier",
        "label": "Hedda Loom — Apparel Catalog",
        "catalogOnly": True,
        "apparel": pieces,
    }

    out_file = OUT_DIR / "hedda-loom.json"
    out_file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest.get("catalogs", [])
    if not any(entry.get("npcId") == "hedda-loom" for entry in entries):
        entries.append({"npcId": "hedda-loom", "file": "hedda-loom.json"})
    manifest["catalogs"] = entries
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(pieces)} apparel items to {out_file}")


if __name__ == "__main__":
    main()
