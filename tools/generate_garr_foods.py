#!/usr/bin/env python3
"""Generate Garr Hopsack's custom food catalog and item art."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "shop-catalogs"
IMG_DIR = ROOT / "assets" / "items" / "foods"
MODULE_IMG = "modules/townforge/assets/items/foods"

TOPIC_STYLES = {
    "baked": ("#8b5a2b", "#f4e2c0", "🍞"),
    "preserved": ("#6b4a2a", "#e8d0a8", "🥫"),
    "grain": ("#9a7b3a", "#f0e6b8", "🌾"),
    "drink": ("#4a5a7a", "#d8e8ff", "🍺"),
    "produce": ("#3f6b3a", "#d8f0c8", "🍎"),
    "hearty": ("#7a3a2a", "#f0c8b0", "🍲"),
    "travel": ("#5a4a3a", "#e0d4c0", "🥾"),
}

FOODS = [
    (
        "Amber Harvest Flatbread",
        "baked",
        2,
        "Warm barley flatbread from Garr's morning kiln, still soft at the edges.",
        "After you finish a Short Rest where you ate this flatbread, you gain 1d4 temporary hit points.",
    ),
    (
        "Sun-Kissed Dried Apricots",
        "produce",
        3,
        "River-valley apricots dried on wicker racks until honey-sweet.",
        "Within the next hour, you have advantage on your next Wisdom (Perception) check.",
    ),
    (
        "River-Town Pickled Herring",
        "preserved",
        4,
        "Brined herring packed in oak barrels for dockhands and carters.",
        "Within the next 8 hours, you gain a +2 bonus to your next Constitution saving throw against poison.",
    ),
    (
        "Smoked Barley Porridge",
        "hearty",
        3,
        "Slow-smoked grain porridge sold by the ladle to cold morning crews.",
        "If you eat this during breakfast, you can reduce your exhaustion level by 1 (no effect if you have 0 exhaustion). You can benefit once per long rest.",
    ),
    (
        "Honey Oat Bites",
        "baked",
        2,
        "Chewy oat clusters bound with local honey from Moll's hives.",
        "For 1 minute after eating, your walking speed increases by 10 feet.",
    ),
    (
        "Caravan Spice Nuts",
        "travel",
        5,
        "Roasted nuts tossed in pepper, cumin, and road-salt for long hauls.",
        "For 1 hour after eating, you have resistance to cold damage.",
    ),
    (
        "Garr's Trail Crunch",
        "travel",
        6,
        "A dense mix of grain, nuts, and dried fruit measured for a full day's march.",
        "You do not need to consume additional food or water for the next 24 hours.",
    ),
    (
        "Golden Millet Cakes",
        "grain",
        2,
        "Small millet cakes stamped with the Hopsack yard mark.",
        "Within the next hour, you gain a +1 bonus to your next Charisma (Persuasion) check.",
    ),
    (
        "Fermented Cabbage Kraut",
        "preserved",
        3,
        "Sharp kraut fermented in stone crocks behind the grain yard.",
        "Within the next 24 hours, you have advantage on your next saving throw against disease.",
    ),
    (
        "Harvest Moon Stew",
        "hearty",
        8,
        "A sealed jar of root-vegetable stew slow-cooked after the autumn moon.",
        "When you consume this stew during a Short Rest, you regain 1d4 + 1 hit points.",
    ),
]


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:64]


def svg_icon(food_id: str, title: str, topic: str) -> str:
    fill, accent, mark = TOPIC_STYLES[topic]
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;")
    words = safe_title.split()
    line1 = " ".join(words[:3])
    line2 = " ".join(words[3:6]) if len(words) > 3 else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="{safe_title}">
  <defs>
    <radialGradient id="g-{food_id}" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="{accent}"/>
      <stop offset="100%" stop-color="{fill}"/>
    </radialGradient>
  </defs>
  <rect width="256" height="256" rx="18" fill="#121418"/>
  <circle cx="128" cy="108" r="78" fill="url(#g-{food_id})" stroke="{accent}" stroke-width="4"/>
  <text x="128" y="118" text-anchor="middle" font-size="42">{mark}</text>
  <text x="128" y="188" text-anchor="middle" fill="{accent}" font-family="Georgia, serif" font-size="14" font-weight="700">{line1}</text>
  <text x="128" y="208" text-anchor="middle" fill="{accent}" font-family="Georgia, serif" font-size="12">{line2}</text>
  <text x="128" y="236" text-anchor="middle" fill="{accent}" font-size="10" opacity="0.85">{topic.upper()}</text>
</svg>
'''


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    foods = []
    for title, topic, price_gp, blurb, passive in FOODS:
        food_id = slugify(title)
        img_path = IMG_DIR / f"{food_id}.svg"
        img_path.write_text(svg_icon(food_id, title, topic), encoding="utf-8")
        foods.append(
            {
                "id": food_id,
                "name": title,
                "topic": topic,
                "priceGP": price_gp,
                "description": blurb,
                "passive": passive,
                "img": f"{MODULE_IMG}/{food_id}.svg",
            }
        )

    catalog = {
        "id": "garr-hopsack",
        "npcId": "garr-hopsack",
        "shopType": "grocer",
        "catalogKind": "food",
        "shopName": "Hopsack Grain & Provisions",
        "label": "Garr Hopsack — Provisions",
        "catalogOnly": True,
        "foods": foods,
    }

    out_file = OUT_DIR / "garr-hopsack.json"
    out_file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = manifest.get("catalogs", [])
    if not any(entry.get("npcId") == "garr-hopsack" for entry in entries):
        entries.append({"npcId": "garr-hopsack", "file": "garr-hopsack.json"})
    manifest["catalogs"] = entries
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(foods)} foods to {out_file}")


if __name__ == "__main__":
    main()
