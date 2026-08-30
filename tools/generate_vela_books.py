#!/usr/bin/env python3
"""Generate Vela Inkwell's 50-book shop catalog."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "shop-catalogs"
IMG_DIR = ROOT / "assets" / "items" / "books"
MODULE_IMG = "modules/townforge/assets/items/books"
BOOK_IMAGE_EXT = ".png"

COMPENDIUM_BOOKS = [
    {"name": "Spellbook", "topic": "magic"},
    {"name": "Book", "topic": "gear"},
    {"name": "Map", "topic": "adventure"},
    {"name": "Parchment (one sheet)", "topic": "gear"},
    {"name": "Paper (one sheet)", "topic": "gear"},
    {"name": "Ink (1 ounce bottle)", "topic": "gear"},
    {"name": "Ink Pen", "topic": "gear"},
    {"name": "Spell Scroll (Cantrip)", "topic": "magic"},
    {"name": "Spell Scroll (Level 1)", "topic": "magic"},
    {"name": "Case, Map or Scroll", "topic": "gear"},
]

BOOKS = [
    # magic — (title, topic, price_gp, description, passive)
    (
        "Principles of Cantrip Craft",
        "magic",
        28,
        "A primer on shaping minor magic without burning out a novice's focus.",
        "After 1 hour of study during a Short Rest, gain a +1 bonus to your next Intelligence (Arcana) check about cantrips.",
    ),
    (
        "Stellar Omens & Night Signs",
        "magic",
        42,
        "Charts constellations said to foretell wars, harvests, and royal successions.",
        "If you study this book under an open sky at night, you have advantage on your next Wisdom (Survival) check made to navigate by the stars.",
    ),
    (
        "The Ember Codex",
        "magic",
        65,
        "Forbidden notes on fire runes copied from a salvaged tower library.",
        "After studying for 1 hour, you have advantage on your next check to identify fire runes, warm magic, or scorch marks.",
    ),
    (
        "Wards for the Wary",
        "magic",
        22,
        "Household protective circles explained for shopkeepers and sailors.",
        "After studying, gain a +1 bonus to your next Intelligence (Investigation) check to find a hidden trap or hazard indoors.",
    ),
    (
        "Whisper-Tongue Grammars",
        "magic",
        38,
        "Studies the dead languages used to bargain with fey envoys.",
        "After 1 hour of study, gain a +1 bonus to your next Charisma check made to parley with fey or undead.",
    ),
    # science
    (
        "Clockwork & Counterweights",
        "science",
        30,
        "Illustrated treatise on gears, springs, and town clock repair.",
        "Gain a +1 bonus to your next Intelligence (Investigation) check involving locks, gears, or clockwork mechanisms.",
    ),
    (
        "On the Weight of Air",
        "science",
        45,
        "Early natural philosophy arguing that wind is matter in motion.",
        "You have advantage on your next check to predict wind, weather, or drafts within the next 24 hours.",
    ),
    (
        "Salt, Sulfur, and Smoke",
        "science",
        33,
        "Field notes on smelting, glassblowing, and kiln temperatures.",
        "Gain a +1 bonus to your next check using smith's tools, glassblower's tools, or when judging kiln heat.",
    ),
    (
        "The Moving Heavens",
        "science",
        52,
        "Controversial models of planets, moons, and tidal pull.",
        "Gain a +1 bonus to your next Intelligence (Arcana) or (Nature) check about moons, tides, or planetary motion.",
    ),
    (
        "Vitals & Humors",
        "science",
        26,
        "A physician's guide to pulse, fever, and sensible bleeding.",
        "After studying, gain a +1 bonus to your next Wisdom (Medicine) check.",
    ),
    # history
    (
        "Chronicle of the First Kings",
        "history",
        40,
        "Royal lineages from mythic founders to the present court.",
        "You have advantage on your next Intelligence (History) check about royalty, succession, or court titles in this region.",
    ),
    (
        "Flood Years of the Low Town",
        "history",
        18,
        "Survivor accounts of the great river rise and rebuilding.",
        "You have advantage on your next Wisdom (Survival) check to find safe footing or shelter in flooded or marshy terrain.",
    ),
    (
        "Guild Charters of Old",
        "history",
        24,
        "Copied statutes governing smiths, weavers, and river pilots.",
        "Gain a +1 bonus to your next Charisma (Persuasion) check with guild artisans, pilots, or trade officials.",
    ),
    (
        "Siege of the Grey Gate",
        "history",
        36,
        "Battle maps and testimony from a decade-long border war.",
        "You have advantage on your next Intelligence (History) check about sieges, fortifications, or siege engines.",
    ),
    (
        "Trade Roads & Toll Stones",
        "history",
        20,
        "Merchant routes, caravan fees, and safe harbors.",
        "Gain a +1 bonus to your next Wisdom (Survival) check to avoid getting lost on a road, trail, or caravan route.",
    ),
    # religion
    (
        "Hymns for Harvest Eve",
        "religion",
        12,
        "Seasonal songs and rites for rural temples.",
        "After reciting one hymn aloud, gain a +1 bonus to your next Charisma (Performance) check.",
    ),
    (
        "Lives of the Lantern Saints",
        "religion",
        34,
        "Hagiographies of healers who walked with a single flame.",
        "You have advantage on your next Wisdom (Religion) check about local saints, shrines, or healing rites.",
    ),
    (
        "Pilgrim Paths East",
        "religion",
        27,
        "Shrines, hostels, and relic customs along a sacred road.",
        "Gain a +1 bonus to your next Wisdom (Survival) check while traveling a marked pilgrim route or holy road.",
    ),
    (
        "The Book of Small Mercies",
        "religion",
        16,
        "Prayers for travelers, midwives, and grieving households.",
        "When you comfort a frightened or grieving creature for 1 minute, it gains a +1 bonus on its next saving throw against being frightened (once).",
    ),
    (
        "Treatise on Sacred Oaths",
        "religion",
        44,
        "When a vow binds the soul—and when it may be broken.",
        "You have advantage on your next Wisdom (Insight) check to tell whether someone is honoring or breaking a sworn vow.",
    ),
    # nature
    (
        "Beasts of the Fen",
        "nature",
        25,
        "Sketches and habits of eels, herons, and marsh cats.",
        "You have advantage on your next Wisdom (Nature) check to identify marsh beasts or their tracks.",
    ),
    (
        "Forest Cant & Herb Lore",
        "nature",
        31,
        "Which leaves soothe fever and which berries kill.",
        "Gain a +1 bonus to your next Intelligence (Nature) check to identify common herbs, berries, or edible plants.",
    ),
    (
        "Mountain Stone & Root",
        "nature",
        29,
        "Geology and foraging among high passes and scree fields.",
        "You have advantage on your next Wisdom (Survival) check foraging in hills, mountains, or rocky highlands.",
    ),
    (
        "Seasons of the Wheat Belt",
        "nature",
        19,
        "Planting calendars tied to river thaw and crow migration.",
        "Gain a +1 bonus to your next Wisdom (Survival) or Intelligence (Nature) check about crops, harvest timing, or farmland.",
    ),
    (
        "Whale Roads",
        "nature",
        37,
        "Sailor charts of migration lanes along cold coasts.",
        "You have advantage on your next Wisdom (Survival) or navigator's tools check on open water or along a coast.",
    ),
    # creatures
    (
        "A Bestiary for Bailiffs",
        "creatures",
        35,
        "Common monsters likely to raid barns and toll roads.",
        "You have advantage on your next Intelligence check to recall the habits of predators or pests near settlements.",
    ),
    (
        "Dragons: A Cautious Survey",
        "creatures",
        75,
        "Scholarly skepticism about scale, hoards, and flame.",
        "Gain a +1 bonus to your next Intelligence (Arcana) or (Nature) check about dragons, wyrmlings, or dragon lairs.",
    ),
    (
        "Goblin Customs & Taboos",
        "creatures",
        21,
        "Observations from a truce envoy who returned alive.",
        "You have advantage on your next Charisma check when parleying with goblins, hobgoblins, or bugbears.",
    ),
    (
        "Owlbear Nesting Notes",
        "creatures",
        23,
        "Where not to camp, according to rangers.",
        "Gain a +1 bonus to your next Wisdom (Perception) check to spot owlbear sign, feathers, or nesting grounds.",
    ),
    (
        "Trolls Under the Bridge",
        "creatures",
        27,
        "Folklore cross-checked with toll-keeper interviews.",
        "You have advantage on your next Intelligence (Investigation) check near bridges, fords, or toll crossings.",
    ),
    # alchemy
    (
        "Antidotes & Neutral Salts",
        "alchemy",
        32,
        "Recipes for venom counters and sting poultices.",
        "Gain a +1 bonus to your next Wisdom (Medicine) check to treat poison, venom, or toxic stings.",
    ),
    (
        "Distillation for Beginners",
        "alchemy",
        28,
        "Safe glasswork and flame control for apothecaries.",
        "You have advantage on your next check using alchemist's supplies or brewer's supplies for a mundane brew.",
    ),
    (
        "Elixirs of Wakefulness",
        "alchemy",
        48,
        "Stimulant tonics popular with watch captains.",
        "For the next 4 hours, you have advantage on Constitution saving throws against exhaustion caused by lack of sleep (once per long rest).",
    ),
    (
        "Ink of Binding",
        "alchemy",
        55,
        "Arcane formulae for contracts that resist forgery.",
        "Gain a +1 bonus to your next Intelligence (Investigation) check to spot forged signatures, seals, or contract clauses.",
    ),
    (
        "Pigments & Preservatives",
        "alchemy",
        24,
        "How to keep maps and scrolls from mildew.",
        "You have advantage on your next check to preserve maps, books, or documents from mildew, smearing, or water damage.",
    ),
    # law
    (
        "Bailiff's Field Manual",
        "law",
        22,
        "Arrest, holding, and fair notice in market towns.",
        "Gain a +1 bonus to your next Charisma (Intimidation or Persuasion) check when acting as an agent of the law.",
    ),
    (
        "Charter of the Free Bridge",
        "law",
        30,
        "River crossing rights fought over for three generations.",
        "You have advantage on your next check to negotiate tolls, tariffs, or river crossing fees.",
    ),
    (
        "Inheritance in Ten Tables",
        "law",
        26,
        "Who inherits a shop when siblings disagree.",
        "Gain a +1 bonus to your next Intelligence (Investigation) check involving wills, deeds, or inheritance disputes.",
    ),
    (
        "Market Measures & Penalties",
        "law",
        18,
        "Weights, false scales, and public shaming fines.",
        "You have advantage on your next Wisdom (Perception) check to spot false scales, short measure, or rigged weights.",
    ),
    (
        "Oaths Before the Magistrate",
        "law",
        40,
        "Recorded speeches from famous trials.",
        "You have advantage on your next Charisma (Persuasion) check before a judge, magistrate, or court official.",
    ),
    # poetry
    (
        "Ballads of the Lost Company",
        "poetry",
        14,
        "Soldier songs from a company that never returned.",
        "Gain a +1 bonus to your next Charisma (Performance) check when singing or reciting soldier ballads.",
    ),
    (
        "Elegies for River Towns",
        "poetry",
        16,
        "Mourning verse after floods and failed harvests.",
        "After reading an elegy aloud for 1 minute, one ally who listens gains a +1 bonus on their next saving throw against fear.",
    ),
    (
        "Love Letters Never Sent",
        "poetry",
        11,
        "Romantic poems copied from a sealed estate chest.",
        "Gain a +1 bonus to your next Charisma (Persuasion) check in a romantic or heartfelt conversation.",
    ),
    (
        "Songs the Gulls Know",
        "poetry",
        13,
        "Harbor poetry in salt-stained chapbook form.",
        "You have advantage on your next Charisma (Performance) check performed in a harbor, port, or dockside tavern.",
    ),
    (
        "The Green Knight's Lay",
        "poetry",
        20,
        "Chivalric romance in uneven rhyme.",
        "Gain a +1 bonus to your next Charisma (Performance) or (Persuasion) check involving chivalric etiquette or courtly manners.",
    ),
    # adventure
    (
        "Cave Maps of the Red Hills",
        "adventure",
        33,
        "Survey sketches sold without guarantee of return.",
        "You have advantage on your next Wisdom (Survival) check to avoid getting lost in caves or red-rock badlands.",
    ),
    (
        "Dungeon Delver's Checklist",
        "adventure",
        25,
        "Rope lengths, chalk marks, and retreat signals.",
        "Gain a +1 bonus to your next Wisdom (Perception) check to spot traps, loose stone, or unsafe footing underground.",
    ),
    (
        "Mercenary Contracts Explained",
        "adventure",
        29,
        "What a company owes you when the lord defaults.",
        "You have advantage on your next Intelligence (Investigation) check to read contracts, pay clauses, or mercenary terms.",
    ),
    (
        "Sailor's Storm Almanac",
        "adventure",
        31,
        "Weather signs trusted on long blue-water runs.",
        "You have advantage on your next Wisdom (Survival) check to predict an imminent storm at sea or on the coast.",
    ),
    (
        "The Squire's First Tour",
        "adventure",
        17,
        "Practical advice for youths joining a road company.",
        "Gain a +1 bonus to your next Wisdom (Animal Handling) or Charisma check when dealing with mounts, camp followers, or road crews.",
    ),
]

MOTIF_RULES = [
    (r"\b(ember|flame|fire|lantern)\b", "flame"),
    (r"\b(stellar|star|heavens|omens)\b", "stars"),
    (r"\b(ward|circle|binding)\b", "ward"),
    (r"\b(whisper|tongue|grammar)\b", "runes"),
    (r"\b(clockwork|gear|counterweight)\b", "gears"),
    (r"\b(air|wind|storm|heavens)\b", "wind"),
    (r"\b(salt|sulfur|smoke|kiln)\b", "smoke"),
    (r"\b(vital|humor|physician)\b", "pulse"),
    (r"\b(flood|river|whale|harbor|gull)\b", "waves"),
    (r"\b(siege|gate|mercenary|delver|adventure|squire)\b", "compass"),
    (r"\b(king|royal|guild|trade|toll|market|inherit)\b", "crown"),
    (r"\b(pilgrim|saint|hymn|mercies|oath|sacred)\b", "halo"),
    (r"\b(fen|forest|herb|mountain|root|wheat|season)\b", "leaf"),
    (r"\b(beast|dragon|goblin|owlbear|troll|bestiary)\b", "claw"),
    (r"\b(antidote|distill|elixir|ink|pigment|alchemy)\b", "vial"),
    (r"\b(bailiff|charter|law|magistrate|measures)\b", "scales"),
    (r"\b(love|knight|green)\b", "heart"),
    (r"\b(cave|dungeon|map)\b", "cave"),
]


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:64]


def stable_hash(text: str) -> int:
    value = 0
    for char in text:
        value = (value * 31 + ord(char)) & 0xFFFFFFFF
    return value


def detect_motif(title: str, book_id: str) -> str:
    lower = title.lower()
    for pattern, motif in MOTIF_RULES:
        if re.search(pattern, lower):
            return motif
    motifs = ["flame", "stars", "ward", "runes", "gears", "wind", "waves", "leaf", "claw", "vial", "compass"]
    return motifs[stable_hash(book_id) % len(motifs)]


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    books = []
    missing = []
    for title, topic, price_gp, blurb, passive in BOOKS:
        book_id = slugify(title)
        img_name = f"{book_id}{BOOK_IMAGE_EXT}"
        img_path = IMG_DIR / img_name
        if not img_path.exists():
            missing.append(img_name)
        books.append(
            {
                "id": book_id,
                "name": title,
                "topic": topic,
                "priceGP": price_gp,
                "description": blurb,
                "passive": passive,
                "img": f"{MODULE_IMG}/{img_name}",
            }
        )

    if missing:
        raise SystemExit(
            "Missing book art files in assets/items/books:\n  "
            + "\n  ".join(missing)
            + "\nGenerate covers with tools/vela_book_art.py prompts and rerun."
        )

    catalog = {
        "id": "vela-inkwell",
        "npcId": "vela-inkwell",
        "shopType": "bookstore",
        "shopName": "The Quiet Quire",
        "label": "Vela Inkwell — Book Catalog",
        "catalogOnly": True,
        "compendiumBooks": COMPENDIUM_BOOKS,
        "books": books,
    }

    out_file = OUT_DIR / "vela-inkwell.json"
    out_file.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"catalogs": []}
    entries = [entry for entry in manifest.get("catalogs", []) if entry.get("npcId") != "vela-inkwell"]
    entries.insert(0, {"npcId": "vela-inkwell", "file": "vela-inkwell.json"})
    manifest["catalogs"] = entries
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(books)} books to {out_file}")


if __name__ == "__main__":
    main()
