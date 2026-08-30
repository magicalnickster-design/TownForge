#!/usr/bin/env python3
"""Prompt metadata for Vela Inkwell illustrated book covers."""

from __future__ import annotations

from pathlib import Path
import sys

TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from generate_vela_books import BOOKS, detect_motif, slugify, stable_hash

LEATHER_NAMES = [
    "warm tan",
    "deep maroon",
    "forest green",
    "navy blue",
    "royal violet",
    "olive brown",
    "teal slate",
    "russet brown",
    "deep plum",
    "charcoal blue",
]

MOTIF_DESCRIPTIONS = {
    "flame": "embossed gold flame rising from an open palm",
    "stars": "embossed gold constellation and crescent moon",
    "ward": "embossed gold protective circle with triangle ward",
    "runes": "embossed gold arcane rune ring",
    "gears": "embossed gold clockwork gears and cogwheel",
    "wind": "embossed gold swirling wind spirals",
    "smoke": "embossed gold alchemical smoke and retort",
    "pulse": "embossed gold heartbeat pulse line",
    "waves": "embossed gold ocean waves and anchor",
    "compass": "embossed gold compass rose",
    "crown": "embossed gold royal crown",
    "halo": "embossed gold radiant halo and sun rays",
    "leaf": "embossed gold oak leaf and vine",
    "claw": "embossed gold dragon claw mark",
    "vial": "embossed gold alchemical vial and droplet",
    "scales": "embossed gold balance scales of justice",
    "heart": "embossed gold heart intertwined with thorns",
    "cave": "embossed gold cave entrance and stalactites",
}

PROP_SETS = [
    "lit candle, amethyst crystal, inkwell with quill",
    "brass hourglass, dried herbs, wax seal",
    "silver compass, rolled map fragment, brass keys",
    "rose quartz crystal, dried rose, brass candlestick",
    "copper coins, magnifying glass, leather cord",
    "blue crystal shard, feather quill, sand hourglass",
    "iron lantern, rope coil, chalk sticks",
    "pearl shell, fishing net twine, driftwood",
    "iron calipers, brass gears, blueprint parchment",
    "holy symbol medallion, beeswax candle, prayer beads",
]

RIBBON_COLORS = [
    "purple silk",
    "crimson silk",
    "emerald silk",
    "gold silk",
    "midnight blue silk",
]

PROMPT_TEMPLATE = (
    "Fantasy RPG item icon art. A thick ornate leather-bound grimoire resting on a dark "
    "wooden desk in warm candlelight. {leather} leather cover with elaborate gold filigree "
    "corner protectors, {motif} in the center. Leather strap with brass star clasp. Cream "
    "aged pages, {ribbon} bookmark. Surrounding props: {props}, scattered parchment with "
    "geometric diagrams (no readable text). Painterly digital illustration, rich detail, "
    "dramatic lighting, square composition. NO TEXT OR LETTERS anywhere on the book cover. "
    "Unique composition distinct from other books."
)


def book_art_spec(title: str, book_id: str | None = None) -> dict[str, str]:
    book_id = book_id or slugify(title)
    seed = stable_hash(book_id)
    motif = detect_motif(title, book_id)
    return {
        "id": book_id,
        "title": title,
        "leather": LEATHER_NAMES[seed % len(LEATHER_NAMES)],
        "motif": MOTIF_DESCRIPTIONS.get(motif, MOTIF_DESCRIPTIONS["ward"]),
        "props": PROP_SETS[seed % len(PROP_SETS)],
        "ribbon": RIBBON_COLORS[seed % len(RIBBON_COLORS)],
    }


def book_art_prompt(title: str, book_id: str | None = None) -> str:
    spec = book_art_spec(title, book_id)
    return PROMPT_TEMPLATE.format(**spec)


def all_book_art_specs() -> list[dict[str, str]]:
    return [book_art_spec(title, slugify(title)) for title, *_ in BOOKS]
