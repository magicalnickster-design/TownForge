#!/usr/bin/env python3
"""Generate Vela Inkwell's 50-book shop catalog and unique cover art."""

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

FORMAT_RULES = [
    (r"\b(map|maps|almanac|chart|roads)\b", "folio"),
    (r"\b(hymns|ballads|songs|elegies|lay|letters)\b", "chapbook"),
    (r"\b(manual|checklist|notes|survey|field)\b", "journal"),
    (r"\b(codex|grimoire|treatise|principles)\b", "tome"),
    (r"\b(chronicle|charter|tables|oaths)\b", "ledger"),
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


def hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*(max(0, min(255, channel)) for channel in rgb))


def shift_color(color: str, hue_delta: int, lighten: int = 0) -> str:
    r, g, b = hex_to_rgb(color)
    r = max(0, min(255, r + hue_delta))
    g = max(0, min(255, g + (hue_delta // 2)))
    b = max(0, min(255, b - (hue_delta // 3) + lighten))
    return rgb_to_hex((r, g, b))


def detect_format(title: str, book_id: str) -> str:
    lower = title.lower()
    for pattern, fmt in FORMAT_RULES:
        if re.search(pattern, lower):
            return fmt
    variants = ["tome", "chapbook", "journal", "ledger", "folio"]
    return variants[stable_hash(book_id) % len(variants)]


def detect_motif(title: str, book_id: str) -> str:
    lower = title.lower()
    for pattern, motif in MOTIF_RULES:
        if re.search(pattern, lower):
            return motif
    motifs = ["flame", "stars", "ward", "runes", "gears", "wind", "waves", "leaf", "claw", "vial", "compass"]
    return motifs[stable_hash(book_id) % len(motifs)]


def title_lines(title: str) -> tuple[str, str, str]:
    safe = title.replace("&", "&amp;").replace("<", "&lt;")
    words = safe.split()
    if len(words) <= 3:
        return safe, "", ""
    if len(words) <= 6:
        return " ".join(words[:3]), " ".join(words[3:]), ""
    return " ".join(words[:3]), " ".join(words[3:6]), " ".join(words[6:9])


def motif_svg(motif: str, accent: str, seed: int) -> str:
  opacity = 0.22 + (seed % 4) * 0.06
  if motif == "flame":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M128 78 C118 98, 112 108, 128 128 C144 108, 138 98, 128 78 Z"/>
    <path d="M128 92 C122 104, 120 110, 128 118 C136 110, 134 104, 128 92 Z" fill="{accent}" opacity="0.35"/>
  </g>'''
  if motif == "stars":
      stars = []
      for index in range(5):
          x = 88 + ((seed + index * 17) % 80)
          y = 72 + ((seed + index * 23) % 56)
          size = 2 + (index % 3)
          stars.append(f'<circle cx="{x}" cy="{y}" r="{size}" fill="{accent}"/>')
      return f'<g opacity="{opacity + 0.15:.2f}">{"".join(stars)}</g>'
  if motif == "ward":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <circle cx="128" cy="102" r="34"/>
    <circle cx="128" cy="102" r="22"/>
    <path d="M128 68 L140 92 L166 92 L146 108 L154 132 L128 118 L102 132 L110 108 L90 92 L116 92 Z" opacity="0.5"/>
  </g>'''
  if motif == "runes":
      rune_chars = "ᚠᚢᚦᚨᚱᚲ"
      glyphs = []
      for index in range(6):
          x = 74 + index * 18
          y = 88 + (index % 2) * 10
          glyphs.append(
              f'<text x="{x}" y="{y}" fill="{accent}" font-size="14" font-family="serif">{rune_chars[index]}</text>'
          )
      return f'<g opacity="{opacity + 0.1:.2f}">{"".join(glyphs)}</g>'
  if motif == "gears":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <circle cx="108" cy="98" r="16"/><circle cx="108" cy="98" r="6"/>
    <circle cx="148" cy="108" r="12"/><circle cx="148" cy="108" r="4"/>
    <path d="M108 82 L108 86 M108 110 L108 114 M92 98 L96 98 M120 98 L124 98"/>
  </g>'''
  if motif == "wind":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2" stroke-linecap="round">
    <path d="M82 86 C104 80, 118 92, 140 86"/>
    <path d="M78 102 C102 96, 122 110, 152 102"/>
    <path d="M86 118 C108 112, 126 124, 146 118"/>
  </g>'''
  if motif == "smoke":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M108 120 C100 108, 112 96, 120 108 C128 96, 136 108, 128 120"/>
    <path d="M138 118 C132 108, 142 98, 148 108"/>
  </g>'''
  if motif == "pulse":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M78 104 L92 104 L100 88 L108 120 L116 96 L124 104 L178 104"/>
  </g>'''
  if motif == "waves":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M72 108 C88 98, 104 118, 120 108 C136 98, 152 118, 168 108"/>
    <path d="M68 124 C92 114, 108 134, 132 124 C148 118, 160 130, 184 124"/>
  </g>'''
  if motif == "compass":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <circle cx="128" cy="102" r="28"/>
    <path d="M128 78 L134 102 L128 126 L122 102 Z" fill="{accent}" opacity="0.25"/>
    <path d="M128 74 L128 82 M128 122 L128 130 M104 102 L112 102 M144 102 L152 102"/>
  </g>'''
  if motif == "crown":
      return f'''
  <g opacity="{opacity:.2f}" fill="{accent}">
    <path d="M96 112 L104 92 L116 104 L128 86 L140 104 L152 92 L160 112 Z"/>
  </g>'''
  if motif == "halo":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <ellipse cx="128" cy="96" rx="34" ry="10"/>
    <path d="M128 106 L128 124"/>
  </g>'''
  if motif == "leaf":
      return f'''
  <g opacity="{opacity:.2f}" fill="{accent}">
    <path d="M128 78 C110 96, 110 118, 128 128 C146 118, 146 96, 128 78 Z"/>
    <path d="M128 82 L128 124" stroke="{accent}" stroke-width="2" fill="none"/>
  </g>'''
  if motif == "claw":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2" stroke-linecap="round">
    <path d="M108 118 C104 100, 112 86, 120 96"/>
    <path d="M128 120 C124 98, 132 82, 140 94"/>
    <path d="M148 118 C144 102, 150 88, 156 98"/>
  </g>'''
  if motif == "vial":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M118 82 L118 92 L110 118 L110 126 L146 126 L146 118 L138 92 L138 82 Z"/>
    <rect x="114" y="118" width="28" height="10" fill="{accent}" opacity="0.25"/>
  </g>'''
  if motif == "scales":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M96 112 L160 112"/>
    <path d="M128 112 L128 92"/>
    <path d="M104 112 C104 98, 116 92, 120 104"/>
    <path d="M152 112 C152 98, 140 92, 136 104"/>
  </g>'''
  if motif == "heart":
      return f'''
  <g opacity="{opacity:.2f}" fill="{accent}">
    <path d="M128 126 C108 108, 104 92, 118 88 C124 86, 128 92, 132 88 C146 92, 148 108, 128 126 Z"/>
  </g>'''
  if motif == "cave":
      return f'''
  <g opacity="{opacity:.2f}" fill="none" stroke="{accent}" stroke-width="2">
    <path d="M88 126 L104 88 L128 78 L152 88 L168 126 Z"/>
    <path d="M112 126 L120 104 L136 104 L144 126"/>
  </g>'''
  return ""


def format_layout(fmt: str, book_id: str, spine: str, page: str, accent: str, seed: int) -> tuple[str, int, int, int, int]:
    """Return cover rect markup and x, y, width, height."""
    if fmt == "chapbook":
        return (
            f'''
  <rect x="46" y="34" width="164" height="252" rx="4" fill="url(#g-{book_id})" stroke="{page}" stroke-width="2"/>
  <rect x="52" y="40" width="8" height="240" fill="{page}" opacity="0.28"/>
  <rect x="196" y="120" width="6" height="80" rx="2" fill="{accent}" opacity="0.55"/>''',
            46,
            34,
            164,
            252,
        )
    if fmt == "folio":
        return (
            f'''
  <rect x="34" y="48" width="188" height="224" rx="4" fill="url(#g-{book_id})" stroke="{page}" stroke-width="2"/>
  <path d="M128 48 L128 272" stroke="{page}" opacity="0.35"/>
  <rect x="40" y="54" width="10" height="212" fill="{page}" opacity="0.22"/>
  <rect x="206" y="54" width="10" height="212" fill="{page}" opacity="0.22"/>''',
            34,
            48,
            188,
            224,
        )
    if fmt == "journal":
        return (
            f'''
  <rect x="40" y="28" width="176" height="264" rx="5" fill="url(#g-{book_id})" stroke="{page}" stroke-width="2"/>
  <rect x="48" y="36" width="10" height="248" fill="{page}" opacity="0.3"/>
  <line x1="72" y1="52" x2="200" y2="52" stroke="{page}" opacity="0.18"/>
  <line x1="72" y1="72" x2="200" y2="72" stroke="{page}" opacity="0.18"/>
  <rect x="188" y="120" width="18" height="72" rx="3" fill="none" stroke="{accent}" stroke-width="2" opacity="0.7"/>''',
            40,
            28,
            176,
            264,
        )
    if fmt == "ledger":
        return (
            f'''
  <rect x="36" y="24" width="184" height="272" rx="5" fill="url(#g-{book_id})" stroke="{page}" stroke-width="3"/>
  <rect x="44" y="32" width="14" height="256" fill="{page}" opacity="0.32"/>
  <circle cx="198" cy="58" r="16" fill="none" stroke="{accent}" stroke-width="2" opacity="0.75"/>
  <circle cx="198" cy="58" r="6" fill="{accent}" opacity="0.35"/>''',
            36,
            24,
            184,
            272,
        )
    clasp_y = 118 + (seed % 24)
    return (
        f'''
  <rect x="28" y="20" width="200" height="280" rx="6" fill="url(#g-{book_id})" stroke="{page}" stroke-width="3"/>
  <rect x="36" y="28" width="12" height="264" fill="{page}" opacity="0.35"/>
  <rect x="214" y="{clasp_y}" width="10" height="44" rx="3" fill="{accent}" opacity="0.8"/>
  <circle cx="219" cy="{clasp_y + 22}" r="4" fill="{page}"/>''',
        28,
        20,
        200,
        280,
    )


def corner_ornaments(seed: int, accent: str, x: int, y: int, w: int, h: int) -> str:
    style = seed % 4
    if style == 0:
        return f'''
  <path d="M{x + 10} {y + 10} L{x + 28} {y + 10} M{x + 10} {y + 10} L{x + 10} {y + 28}" stroke="{accent}" opacity="0.45" fill="none"/>
  <path d="M{x + w - 10} {y + 10} L{x + w - 28} {y + 10} M{x + w - 10} {y + 10} L{x + w - 10} {y + 28}" stroke="{accent}" opacity="0.45" fill="none"/>
  <path d="M{x + 10} {y + h - 10} L{x + 28} {y + h - 10} M{x + 10} {y + h - 10} L{x + 10} {y + h - 28}" stroke="{accent}" opacity="0.45" fill="none"/>
  <path d="M{x + w - 10} {y + h - 10} L{x + w - 28} {y + h - 10} M{x + w - 10} {y + h - 10} L{x + w - 10} {y + h - 28}" stroke="{accent}" opacity="0.45" fill="none"/>'''
    if style == 1:
        return f'''
  <circle cx="{x + 16}" cy="{y + 16}" r="5" fill="none" stroke="{accent}" opacity="0.4"/>
  <circle cx="{x + w - 16}" cy="{y + 16}" r="5" fill="none" stroke="{accent}" opacity="0.4"/>
  <circle cx="{x + 16}" cy="{y + h - 16}" r="5" fill="none" stroke="{accent}" opacity="0.4"/>
  <circle cx="{x + w - 16}" cy="{y + h - 16}" r="5" fill="none" stroke="{accent}" opacity="0.4"/>'''
    if style == 2:
        return f'''
  <rect x="{x + 8}" y="{y + 8}" width="18" height="18" fill="none" stroke="{accent}" opacity="0.35"/>
  <rect x="{x + w - 26}" y="{y + 8}" width="18" height="18" fill="none" stroke="{accent}" opacity="0.35"/>
  <rect x="{x + 8}" y="{y + h - 26}" width="18" height="18" fill="none" stroke="{accent}" opacity="0.35"/>
  <rect x="{x + w - 26}" y="{y + h - 26}" width="18" height="18" fill="none" stroke="{accent}" opacity="0.35"/>'''
    diamonds = []
    for px, py in ((x + 14, y + 14), (x + w - 14, y + 14), (x + 14, y + h - 14), (x + w - 14, y + h - 14)):
        diamonds.append(f'<path d="M{px} {py - 6} L{px + 6} {py} L{px} {py + 6} L{px - 6} {py} Z" fill="{accent}" opacity="0.28"/>')
    return "".join(diamonds)


def svg_cover(book_id: str, title: str, topic: str) -> str:
    base_spine, base_page, mark = TOPIC_STYLES[topic]
    seed = stable_hash(book_id)
    hue_shift = (seed % 41) - 20
    spine = shift_color(base_spine, hue_shift)
    page = shift_color(base_page, hue_shift // 2, lighten=8)
    accent = shift_color(page, (seed % 17) - 8, lighten=12)
    fmt = detect_format(title, book_id)
    motif = detect_motif(title, book_id)
    line1, line2, line3 = title_lines(title)
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;")
    layout_svg, cx, cy, cw, ch = format_layout(fmt, book_id, spine, page, accent, seed)
    band_y = cy + ch - 34
    title_y = cy + int(ch * 0.52)
    line_gap = 18 if not line3 else 16
    motif_y = cy + int(ch * 0.28)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="256" height="320" viewBox="0 0 256 320" role="img" aria-label="{safe_title}">
  <defs>
    <linearGradient id="g-{book_id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{spine}"/>
      <stop offset="55%" stop-color="{shift_color(spine, -12)}"/>
      <stop offset="100%" stop-color="#141418"/>
    </linearGradient>
    <radialGradient id="shine-{book_id}" cx="30%" cy="20%" r="70%">
      <stop offset="0%" stop-color="{page}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="{page}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="256" height="320" rx="10" fill="#0f1014"/>
  <rect x="18" y="12" width="220" height="296" rx="8" fill="#090a0d" opacity="0.55"/>
{layout_svg}
  <rect x="{cx}" y="{cy}" width="{cw}" height="{ch}" rx="6" fill="url(#shine-{book_id})" pointer-events="none"/>
  <g transform="translate(0,{motif_y - 102})">{motif_svg(motif, accent, seed)}</g>
  {corner_ornaments(seed, accent, cx, cy, cw, ch)}
  <text x="128" y="{title_y - line_gap}" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="13" font-weight="700">{line1}</text>
  <text x="128" y="{title_y}" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="12">{line2}</text>
  <text x="128" y="{title_y + line_gap}" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="11">{line3}</text>
  <text x="128" y="{band_y}" text-anchor="middle" fill="{accent}" font-size="10" letter-spacing="1.2">{topic.upper()}</text>
  <text x="128" y="{cy + 18}" text-anchor="middle" fill="{page}" font-family="Georgia, serif" font-size="20" opacity="0.85">{mark}</text>
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
        "catalogOnly": True,
        "compendiumBooks": COMPENDIUM_BOOKS,
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
