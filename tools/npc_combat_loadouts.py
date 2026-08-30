"""Combat loadouts for TownForge NPCs — dnd5e classes, compendium gear, and spells."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

# Stable SRD compendium UUIDs (slug-style ids used by the dnd5e system).
ITEM = "Compendium.dnd5e.items.{slug}"
SPELL = "Compendium.dnd5e.spells.{slug}"

HIT_DICE: dict[str, int] = {
    "barbarian": 12,
    "fighter": 10,
    "paladin": 10,
    "ranger": 10,
    "bard": 8,
    "cleric": 8,
    "rogue": 8,
    "monk": 8,
    "warlock": 8,
    "wizard": 6,
    "sorcerer": 6,
    "commoner": 4,
}

ARMOR_AC: dict[str, int] = {
    "padded-armor": 11,
    "leather-armor": 11,
    "studded-leather": 12,
    "hide-armor": 12,
    "chain-shirt": 13,
    "scale-mail": 14,
    "breastplate": 14,
    "half-plate": 15,
    "plate": 18,
}

CR_BY_LEVEL: dict[int, float] = {
    1: 0.125,
    2: 0.25,
    3: 0.5,
    4: 1,
    5: 2,
    6: 3,
    7: 4,
    8: 5,
}


def compendium_item(slug: str, *, equipped: bool = False, quantity: int = 1) -> dict[str, Any]:
    return {
        "compendium": ITEM.format(slug=slug),
        "equipped": equipped,
        "quantity": quantity,
    }


def compendium_spell(slug: str) -> dict[str, Any]:
    return {"compendium": SPELL.format(slug=slug), "type": "spell"}


def class_item(identifier: str, level: int, name: str | None = None) -> dict[str, Any]:
    label = name or identifier.replace("-", " ").title()
    return {
        "name": label,
        "type": "class",
        "system": {
            "identifier": identifier,
            "levels": level,
        },
    }


def prof_bonus(level: int) -> int:
    return 2 + max(0, (level - 1) // 4)


def ability_mod(score: int) -> int:
    return (int(score) - 10) // 2


def estimate_hp(class_id: str, level: int, con_score: int) -> int:
    die = HIT_DICE.get(class_id, 8)
    con_mod = ability_mod(con_score)
    first = max(1, die + con_mod)
    if level <= 1:
        return first
    per_level = max(1, (die // 2) + 1 + con_mod)
    return first + per_level * (level - 1)


def estimate_ac(loadout: Loadout, dex_score: int) -> int:
    dex_mod = ability_mod(dex_score)
    body_ac = 0
    shield = False
    for slug, equipped in loadout.armor:
        if not equipped:
            continue
        if slug == "shield":
            shield = True
            continue
        body_ac = max(body_ac, ARMOR_AC.get(slug, 0))

    if not body_ac:
        ac = 10 + dex_mod
    elif body_ac <= 12:
        ac = body_ac + dex_mod
    elif body_ac == 13:
        ac = body_ac + min(2, dex_mod)
    else:
        ac = body_ac + min(0, dex_mod)

    if shield:
        ac += 2
    return max(10, ac)


def estimate_cr(level: int) -> float:
    if level in CR_BY_LEVEL:
        return CR_BY_LEVEL[level]
    if level <= 12:
        return float(level - 2)
    return 10.0


SPELL_SETS: dict[str, list[str]] = {
    "wizard_2": [
        "fire-bolt",
        "light",
        "mage-hand",
        "magic-missile",
        "shield",
    ],
    "wizard_5": [
        "fire-bolt",
        "light",
        "mage-hand",
        "prestidigitation",
        "magic-missile",
        "shield",
        "detect-magic",
        "misty-step",
        "web",
        "fireball",
        "counterspell",
    ],
    "sorcerer_5": [
        "fire-bolt",
        "light",
        "mage-hand",
        "burning-hands",
        "chromatic-orb",
        "shield",
        "misty-step",
        "fireball",
        "counterspell",
    ],
    "cleric_1": [
        "sacred-flame",
        "guidance",
        "spare-the-dying",
        "cure-wounds",
        "bless",
    ],
    "cleric_3": [
        "sacred-flame",
        "guidance",
        "spare-the-dying",
        "cure-wounds",
        "bless",
        "shield-of-faith",
        "lesser-restoration",
        "spiritual-weapon",
    ],
    "cleric_5": [
        "sacred-flame",
        "guidance",
        "spare-the-dying",
        "cure-wounds",
        "bless",
        "shield-of-faith",
        "lesser-restoration",
        "spiritual-weapon",
        "revivify",
        "spirit-guardians",
    ],
    "bard_2": [
        "vicious-mockery",
        "prestidigitation",
        "healing-word",
        "faerie-fire",
        "disguise-self",
    ],
    "bard_4": [
        "vicious-mockery",
        "prestidigitation",
        "healing-word",
        "faerie-fire",
        "disguise-self",
        "suggestion",
        "hold-person",
    ],
    "ranger_2": [
        "hunters-mark",
        "cure-wounds",
        "goodberry",
    ],
    "ranger_3": [
        "hunters-mark",
        "cure-wounds",
        "goodberry",
        "pass-without-trace",
    ],
}


class Loadout:
    def __init__(
        self,
        class_id: str,
        level: int,
        *,
        class_name: str | None = None,
        weapons: list[tuple[str, bool]] | None = None,
        armor: list[tuple[str, bool]] | None = None,
        tools: list[str] | None = None,
        gear: list[str] | None = None,
        spells: str | None = None,
    ):
        self.class_id = class_id
        self.level = level
        self.class_name = class_name
        self.weapons = weapons or []
        self.armor = armor or []
        self.tools = tools or []
        self.gear = gear or []
        self.spells = spells


ARCHETYPE_GEAR: dict[str, list[str]] = {
    "civilian": ["backpack", "bedroll", "rations", "waterskin"],
    "merchant": ["backpack", "pouch", "merchant-scale"],
    "innkeeper": ["backpack", "rations", "waterskin"],
    "scholar": ["backpack", "book", "ink", "ink-pen", "parchment"],
    "mage": ["component-pouch", "arcane-focus", "book", "ink", "ink-pen"],
    "priest": ["holy-symbol", "healers-kit", "candle", "incense"],
    "guard": ["hempen-rope", "manacles", "hooded-lantern", "signal-whistle", "rations"],
    "guard_captain": ["hempen-rope", "manacles", "hooded-lantern", "signal-whistle", "healing-potion"],
    "criminal": ["thieves-tools", "crowbar", "common-clothes", "pouch"],
    "noble": ["common-clothes", "pouch", "candle"],
    "blacksmith": ["smiths-tools", "hammer", "shovel", "rations"],
    "craftsman": ["artisans-tools", "hammer", "rations", "waterskin"],
    "traveler": ["explorers-pack", "bedroll", "rations", "waterskin", "tinderbox"],
    "official": ["calligraphers-supplies", "manacles", "ink", "ink-pen", "parchment"],
}


ARCHETYPE_LOADOUTS: dict[str, Loadout] = {
    "civilian": Loadout("commoner", 1),
    "merchant": Loadout(
        "rogue",
        2,
        weapons=[("dagger", True)],
        armor=[("leather-armor", True)],
        tools=["thieves-tools"],
    ),
    "innkeeper": Loadout(
        "fighter",
        2,
        weapons=[("mace", True)],
        armor=[("leather-armor", True)],
        tools=["brewers-supplies"],
    ),
    "scholar": Loadout(
        "wizard",
        2,
        weapons=[("dagger", True)],
        tools=["scholars-pack"],
        spells="wizard_2",
    ),
    "mage": Loadout(
        "wizard",
        5,
        weapons=[("quarterstaff", True)],
        tools=["component-pouch"],
        spells="wizard_5",
    ),
    "priest": Loadout(
        "cleric",
        3,
        weapons=[("mace", True)],
        armor=[("chain-shirt", True), ("shield", True)],
        tools=["holy-symbol"],
        spells="cleric_3",
    ),
    "guard": Loadout(
        "fighter",
        2,
        weapons=[("spear", True), ("shortsword", False)],
        armor=[("chain-shirt", True), ("shield", True)],
    ),
    "guard_captain": Loadout(
        "fighter",
        4,
        weapons=[("longsword", True), ("light-crossbow", False)],
        armor=[("breastplate", True), ("shield", True)],
    ),
    "criminal": Loadout(
        "rogue",
        2,
        weapons=[("shortsword", True), ("dagger", False)],
        armor=[("leather-armor", True)],
        tools=["thieves-tools"],
    ),
    "noble": Loadout(
        "bard",
        2,
        weapons=[("rapier", True)],
        armor=[("leather-armor", True)],
        spells="bard_2",
    ),
    "blacksmith": Loadout(
        "fighter",
        3,
        weapons=[("warhammer", True)],
        armor=[("studded-leather", True)],
        tools=["smiths-tools"],
    ),
    "craftsman": Loadout(
        "fighter",
        2,
        weapons=[("light-hammer", True)],
        tools=["artisans-tools"],
    ),
    "traveler": Loadout(
        "ranger",
        2,
        weapons=[("shortsword", True), ("shortbow", False)],
        armor=[("leather-armor", True)],
        tools=["explorers-pack"],
        spells="ranger_2",
    ),
    "official": Loadout(
        "fighter",
        3,
        weapons=[("rapier", True), ("club", False)],
        armor=[("studded-leather", True)],
        tools=["calligraphers-supplies"],
    ),
}


OCCUPATION_LOADOUT_OVERRIDES: dict[str, dict[str, Any]] = {
    "Oracle": {"class_id": "sorcerer", "level": 5, "class_name": "Sorcerer", "spells": "sorcerer_5"},
    "Town Mage": {"class_id": "wizard", "level": 5, "spells": "wizard_5"},
    "Temple Priestess": {"class_id": "cleric", "level": 5, "spells": "cleric_5"},
    "Guard Chaplain": {"class_id": "cleric", "level": 3, "spells": "cleric_3"},
    "Funeral Priest": {"class_id": "cleric", "level": 4, "spells": "cleric_3"},
    "Cloister Monk": {"class_id": "cleric", "level": 3, "spells": "cleric_3", "armor": [], "weapons": [("quarterstaff", True)]},
    "Acolyte": {"class_id": "cleric", "level": 2, "spells": "cleric_1", "armor": [], "weapons": [("quarterstaff", True)]},
    "Apothecary Clerk": {"class_id": "wizard", "level": 2, "spells": "wizard_2", "tools": ["herbalism-kit", "alchemists-supplies"]},
    "Bookstore Owner": {"class_id": "wizard", "level": 2, "spells": "wizard_2"},
    "Library Archivist": {"class_id": "wizard", "level": 3, "spells": "wizard_2"},
    "Town Historian": {"class_id": "wizard", "level": 3, "spells": "wizard_2"},
    "Cartographer": {"class_id": "wizard", "level": 2, "spells": "wizard_2"},
    "Forgery Clerk": {"class_id": "wizard", "level": 2, "spells": "wizard_2", "tools": ["calligraphers-supplies"]},
    "Alchemist": {"class_id": "wizard", "level": 4, "spells": "wizard_2", "tools": ["alchemists-supplies", "herbalism-kit"]},
    "Fence": {"class_id": "rogue", "level": 3, "weapons": [("shortsword", True), ("dagger", False)]},
    "Undercover Watcher": {"class_id": "rogue", "level": 3, "weapons": [("shortsword", True), ("hand-crossbow", False)]},
    "Pickpocket": {"class_id": "rogue", "level": 1},
    "Debt Collector": {"class_id": "rogue", "level": 2, "weapons": [("mace", True), ("dagger", False)]},
    "Wall Archer": {"class_id": "fighter", "level": 3, "weapons": [("shortbow", True), ("shortsword", False)], "armor": [("studded-leather", True)]},
    "Knight Retainer": {"class_id": "fighter", "level": 5, "weapons": [("longsword", True), ("lance", False)], "armor": [("plate", True), ("shield", True)]},
    "City Guard Captain": {"class_id": "fighter", "level": 5, "weapons": [("longsword", True), ("light-crossbow", False)], "armor": [("breastplate", True), ("shield", True)]},
    "Gate Sergeant": {"class_id": "fighter", "level": 3, "weapons": [("longsword", True), ("javelin", False)], "armor": [("chain-shirt", True), ("shield", True)]},
    "Night Patrol Lead": {"class_id": "fighter", "level": 3, "weapons": [("spear", True), ("shortsword", False)], "armor": [("chain-shirt", True), ("shield", True)]},
    "Armory Warden": {"class_id": "fighter", "level": 4, "weapons": [("warhammer", True), ("light-crossbow", False)], "armor": [("breastplate", True)]},
    "Wilderness Scout": {"class_id": "ranger", "level": 3, "spells": "ranger_3"},
    "Game Hunter": {"class_id": "ranger", "level": 3, "spells": "ranger_3", "weapons": [("longbow", True), ("shortsword", False)]},
    "Herb Gatherer": {"class_id": "ranger", "level": 2, "spells": "ranger_2", "tools": ["herbalism-kit"]},
    "Evening Singer": {"class_id": "bard", "level": 2, "spells": "bard_2"},
    "Traveling Minstrel": {"class_id": "bard", "level": 2, "spells": "bard_2"},
    "Pilgrim": {"class_id": "cleric", "level": 2, "spells": "cleric_1", "weapons": [("quarterstaff", True)]},
    "Bouncer": {"class_id": "barbarian", "level": 3, "weapons": [("greatclub", True)]},
    "Drill Instructor": {"class_id": "fighter", "level": 4, "weapons": [("longsword", True), ("javelin", False)], "armor": [("breastplate", True)]},
    "Bailiff": {"class_id": "fighter", "level": 4, "weapons": [("club", True), ("light-crossbow", False)], "armor": [("studded-leather", True)]},
    "Magistrate": {"class_id": "cleric", "level": 5, "spells": "cleric_5", "weapons": [("mace", True)], "armor": [("chain-shirt", True), ("shield", True)]},
    "Town Mayor": {"class_id": "bard", "level": 5, "spells": "bard_4", "weapons": [("rapier", True)], "armor": [("leather-armor", True)]},
    "Town Clerk": {"class_id": "rogue", "level": 2, "tools": ["calligraphers-supplies"]},
    "Tax Assessor": {"class_id": "rogue", "level": 3, "tools": ["calligraphers-supplies"]},
    "Noble Patron": {"class_id": "bard", "level": 4, "spells": "bard_4"},
    "Mining Magnate": {"class_id": "fighter", "level": 4, "weapons": [("rapier", True)], "armor": [("breastplate", True)]},
}


def _apply_override(loadout: Loadout, override: dict[str, Any]) -> Loadout:
    data = deepcopy(loadout)
    for key, value in override.items():
        if key == "class_id":
            data.class_id = value
        elif key == "class_name":
            data.class_name = value
        elif key == "level":
            data.level = value
        elif key == "weapons":
            data.weapons = [tuple(row) for row in value]
        elif key == "armor":
            data.armor = [tuple(row) for row in value]
        elif key == "tools":
            data.tools = list(value)
        elif key == "gear":
            data.gear = list(value)
        elif key == "spells":
            data.spells = value
    return data


def resolve_loadout(archetype: str, occupation: str) -> Loadout:
    base = ARCHETYPE_LOADOUTS.get(archetype) or ARCHETYPE_LOADOUTS["civilian"]
    override = OCCUPATION_LOADOUT_OVERRIDES.get(occupation)
    loadout = _apply_override(base, override) if override else deepcopy(base)
    if not loadout.gear:
        loadout.gear = list(ARCHETYPE_GEAR.get(archetype, ARCHETYPE_GEAR["civilian"]))
    return loadout


def build_combat_items(archetype: str, occupation: str) -> list[dict[str, Any]]:
    loadout = resolve_loadout(archetype, occupation)
    items: list[dict[str, Any]] = [class_item(loadout.class_id, loadout.level, loadout.class_name)]
    seen_slugs: set[str] = set()

    def add_item(slug: str, *, equipped: bool = False) -> None:
        if slug in seen_slugs:
            return
        seen_slugs.add(slug)
        items.append(compendium_item(slug, equipped=equipped))

    for slug, equipped in loadout.armor:
        add_item(slug, equipped=equipped)
    for slug, equipped in loadout.weapons:
        add_item(slug, equipped=equipped)
    for slug in loadout.tools:
        add_item(slug)
    for slug in loadout.gear:
        add_item(slug)

    if loadout.spells:
        for spell_slug in SPELL_SETS.get(loadout.spells, []):
            items.append(compendium_spell(spell_slug))

    return items


def apply_combat_to_actor_data(actor_data: dict[str, Any], archetype: str, occupation: str) -> dict[str, Any]:
    data = deepcopy(actor_data)
    loadout = resolve_loadout(archetype, occupation)
    data["items"] = build_combat_items(archetype, occupation)

    abilities = data.get("system", {}).get("abilities", {})
    con = abilities.get("con", {}).get("value", 10)
    dex = abilities.get("dex", {}).get("value", 10)

    hp = estimate_hp(loadout.class_id, loadout.level, con)
    ac = estimate_ac(loadout, dex)
    prof = prof_bonus(loadout.level)
    cr = estimate_cr(loadout.level)

    attrs = data.setdefault("system", {}).setdefault("attributes", {})
    attrs["hp"] = {"value": hp, "max": hp}
    attrs["ac"] = {"flat": ac, "calc": "flat"}
    attrs["prof"] = prof

    details = data.setdefault("system", {}).setdefault("details", {})
    details["level"] = loadout.level
    details["cr"] = cr

    return data
