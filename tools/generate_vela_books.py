#!/usr/bin/env python3
"""Generate Vela Inkwell's 50-book shop catalog and cover art."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "shop-catalogs"
IMG_DIR = ROOT / "assets" / "items" / "books"
MODULE_IMG = "modules/townforge/assets/items/books"

TOPIC_STYLES = {
    "magic": ("#4a3b7a", "#c9b6ff", "✦"),
    "science": ("#2f5f6b", "#b8e8f0", "⚗"),
    "history": ("#6b4f2f", "#e8d2a8", "⌛"),
    "religion": ("#5a4a2a", "#f0e2b0", "☼"),
    "nature": ("#2f5a3a", "#c8e6c8", "❧"),
    "creatures": ("#5a2f2f", "#f0c8b8", "🐉"),
    "alchemy": ("#4a5a2a", "#e0f0b0", "⚗"),
    "law": ("#3a3a4a", "#d0d4e8", "§"),
    "poetry": ("#5a3a5a", "#f0c8e8", "♪"),
    "adventure": ("#4a3a2a", "#e8c8a0", "⚔"),
}

BOOKS = [
    # magic
    ("Principles of Cantrip Craft", "magic", 28, "A primer on shaping minor magic without burning out a novice's focus."),
    ("Stellar Omens & Night Signs", "magic", 42, "Charts constellations said to foretell wars, harvests, and royal successions."),
    ("The Ember Codex", "magic", 65, "Forbidden notes on fire runes copied from a salvaged tower library."),
    ("Wards for the Wary", "magic", 22, "Household protective circles explained for shopkeepers and sailors."),
    ("Whisper-Tongue Grammars", "magic", 38, "Studies the dead languages used to bargain with fey envoys."),
    # science
    ("Clockwork & Counterweights", "science", 30, "Illustrated treatise on gears, springs, and town clock repair."),
    ("On the Weight of Air", "science", 45, "Early natural philosophy arguing that wind is matter in motion."),
    ("Salt, Sulfur, and Smoke", "science", 33, "Field notes on smelting, glassblowing, and kiln temperatures."),
    ("The Moving Heavens", "science", 52, "Controversial models of planets, moons, and tidal pull."),
    ("Vitals & Humors", "science", 26, "A physician's guide to pulse, fever, and sensible bleeding."),
    # history
    ("Chronicle of the First Kings", "history", 40, "Royal lineages from mythic founders to the present court."),
    ("Flood Years of the Low Town", "history", 18, "Survivor accounts of the great river rise and rebuilding."),
    ("Guild Charters of Old", "history", 24, "Copied statutes governing smiths, weavers, and river pilots."),
    ("Siege of the Grey Gate", "history", 36, "Battle maps and testimony from a decade-long border war."),
    ("Trade Roads & Toll Stones", "history", 20, "Merchant routes, caravan fees, and safe harbors."),
    # religion
    ("Hymns for Harvest Eve", "religion", 12, "Seasonal songs and rites for rural temples."),
    ("Lives of the Lantern Saints", "religion", 34, "Hagiographies of healers who walked with a single flame."),
    ("Pilgrim Paths East", "religion", 27, "Shrines, hostels, and relic customs along a sacred road."),
    ("The Book of Small Mercies", "religion", 16, "Prayers for travelers, midwives, and grieving households."),
    ("Treatise on Sacred Oaths", "religion", 44, "When a vow binds the soul—and when it may be broken."),
    # nature
    ("Beasts of the Fen", "nature", 25, "Sketches and habits of eels, herons, and marsh cats."),
    ("Forest Cant & Herb Lore", "nature", 31, "Which leaves soothe fever and which berries kill."),
    ("Mountain Stone & Root", "nature", 29, "Geology and foraging among high passes and scree fields."),
    ("Seasons of the Wheat Belt", "nature", 19, "Planting calendars tied to river thaw and crow migration."),
    ("Whale Roads", "nature", 37, "Sailor charts of migration lanes along cold coasts."),
    # creatures
    ("A Bestiary for Bailiffs", "creatures", 35, "Common monsters likely to raid barns and toll roads."),
    ("Dragons: A Cautious Survey", "creatures", 75, "Scholarly skepticism about scale, hoards, and flame."),
    ("Goblin Customs & Taboos", "creatures", 21, "Observations from a truce envoy who returned alive."),
    ("Owlbear Nesting Notes", "creatures", 23, "Where not to camp, according to rangers."),
    ("Trolls Under the Bridge", "creatures", 27, "Folklore cross-checked with toll-keeper interviews."),
    # alchemy
    ("Antidotes & Neutral Salts", "alchemy", 32, "Recipes for venom counters and sting poultices."),
    ("Distillation for Beginners", "alchemy", 28, "Safe glasswork and flame control for apothecaries."),
    ("Elixirs of Wakefulness", "alchemy", 48, "Stimulant tonics popular with watch captains."),
    ("Ink of Binding", "alchemy", 55, "Arcane formulae for contracts that resist forgery."),
    ("Pigments & Preservatives", "alchemy", 24, "How to keep maps and scrolls from mildew."),
    # law
    ("Bailiff's Field Manual", "law", 22, "Arrest, holding, and fair notice in market towns."),
    ("Charter of the Free Bridge", "law", 30, "River crossing rights fought over for three generations."),
    ("Inheritance in Ten Tables", "law", 26, "Who inherits a shop when siblings disagree."),
    ("Market Measures & Penalties", "law", 18, "Weights, false scales, and public shaming fines."),
    ("Oaths Before the Magistrate", "law", 40, "Recorded speeches from famous trials."),
    # poetry
    ("Ballads of the Lost Company", "poetry", 14, "Soldier songs from a company that never returned."),
    ("Elegies for River Towns", "poetry", 16, "Mourning verse after floods and failed harvests."),
    ("Love Letters Never Sent", "poetry", 11, "Romantic poems copied from a sealed estate chest."),
    ("Songs the Gulls Know", "poetry", 13, "Harbor poetry in salt-stained chapbook form."),
    ("The Green Knight's Lay", "poetry", 20, "Chivalric romance in uneven rhyme."),
    # adventure
    ("Cave Maps of the Red Hills", "adventure", 33, "Survey sketches sold without guarantee of return."),
    ("Dungeon Delver's Checklist", "adventure", 25, "Rope lengths, chalk marks, and retreat signals."),
    ("Mercenary Contracts Explained", "adventure", 29, "What a company owes you when the lord defaults."),
    ("Sailor's Storm Almanac", "adventure", 31, "Weather signs trusted on long blue-water runs."),
    ("The Squire's First Tour", "adventure", 17, "Practical advice for youths joining a road company."),
]


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:64]


def svg_cover(book_id: str, title: str, topic: str) -> str:
    spine, page, mark = TOPIC_STYLES[topic]
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;")
    words = safe_title.split()
    line1 = " ".join(words[:3])
    line2 = " ".join(words[3:6]) if len(words) > 3 else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="256" height="320" viewBox="0 0 256 320" role="img" aria-label="{safe_title}">
  <defs>
    <linearGradient id="g-{book_id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{spine}"/>
      <stop offset="100%" stop-color="#141418"/>
    </linearGradient>
  </defs>
  <rect width="256" height="320" rx="10" fill="#0f1014"/>
  <rect x="28" y="20" width="200" height="280" rx="6" fill="url(#g-{book_id})" stroke="{page}" stroke-width="3"/>
  <rect x="36" y="28" width="12" height="264" fill="{page}" opacity="0.35"/>
  <text x="128" y="118" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="28">{mark}</text>
  <text x="128" y="168" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="15" font-weight="700">{line1}</text>
  <text x="128" y="190" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="13">{line2}</text>
  <text x="128" y="262" text-anchor="middle" fill="{page}" font-size="11" opacity="0.8">{topic.upper()}</text>
</svg>
'''


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    books = []
    for title, topic, price_gp, blurb in BOOKS:
        book_id = slugify(title)
        img_path = IMG_DIR / f"{book_id}.svg"
        img_path.write_text(svg_cover(book_id, title, topic), encoding="utf-8")
        books.append(
            {
                "id": book_id,
                "name": title,
                "topic": topic,
                "priceGP": price_gp,
                "description": blurb,
                "img": f"{MODULE_IMG}/{book_id}.svg",
            }
        )

    catalog = {
        "id": "vela-inkwell",
        "npcId": "vela-inkwell",
        "shopType": "bookstore",
        "shopName": "The Quiet Quire",
        "label": "Vela Inkwell — Book Catalog",
        "books": books,
    }

    out_file = OUT_DIR / "vela-inkwell.json"
    out_file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    manifest = {
        "catalogs": [
            {
                "npcId": "vela-inkwell",
                "file": "vela-inkwell.json",
            }
        ]
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(books)} books to {out_file}")


if __name__ == "__main__":
    main()
