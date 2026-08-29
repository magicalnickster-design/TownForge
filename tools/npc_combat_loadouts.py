"""Combat loadouts for TownForge NPCs — dnd5e classes, compendium gear, and spells."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

# Stable SRD compendium UUIDs (slug-style ids used by the dnd5e system).
ITEM = "Compendium.dnd5e.items.{slug}"
SPELL = "Compendium.dnd5e.spells.{slug}"


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
    "bard_2": [
        "vicious-mockery",
        "prestidigitation",
        "healing-word",
        "faerie-fire",
    ],
    "ranger_2": [
        "hunters-mark",
        "cure-wounds",
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
        spells: str | None = None,
    ):
        self.class_id = class_id
        self.level = level
        self.class_name = class_name
        self.weapons = weapons or []
        self.armor = armor or []
        self.tools = tools or []
        self.spells = spells


ARCHETYPE_LOADOUTS: dict[str, Loadout] = {
    "civilian": Loadout("commoner", 1, tools=[]),
    "merchant": Loadout(
        "rogue",
        1,
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
        armor=[("chain-shirt", True)],
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
        1,
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
        1,
        weapons=[("rapier", True)],
        tools=["calligraphers-supplies"],
    ),
}


OCCUPATION_LOADOUT_OVERRIDES: dict[str, dict[str, Any]] = {
    "Oracle": {"class_id": "sorcerer", "level": 5, "class_name": "Sorcerer", "spells": "sorcerer_5"},
    "Town Mage": {"class_id": "wizard", "level": 5, "spells": "wizard_5"},
    "Acolyte": {"class_id": "cleric", "level": 1, "spells": "cleric_1", "armor": [], "weapons": []},
    "Fence": {"class_id": "rogue", "level": 3, "weapons": [("shortsword", True), ("dagger", False)]},
    "Undercover Watcher": {"class_id": "rogue", "level": 3, "weapons": [("shortsword", True), ("hand-crossbow", False)]},
    "Pickpocket": {"class_id": "rogue", "level": 1},
    "Debt Collector": {"class_id": "rogue", "level": 2, "weapons": [("mace", True), ("dagger", False)]},
    "Wall Archer": {"class_id": "fighter", "level": 2, "weapons": [("shortbow", True), ("shortsword", False)], "armor": [("studded-leather", True)]},
    "Knight Retainer": {"class_id": "fighter", "level": 4, "weapons": [("longsword", True), ("lance", False)], "armor": [("plate", True), ("shield", True)]},
    "Alchemist": {"class_id": "wizard", "level": 3, "spells": "wizard_2", "tools": ["alchemists-supplies"]},
    "Wilderness Scout": {"class_id": "ranger", "level": 3, "spells": "ranger_2"},
    "Game Hunter": {"class_id": "ranger", "level": 3, "weapons": [("longbow", True), ("shortsword", False)]},
    "Evening Singer": {"class_id": "bard", "level": 2, "spells": "bard_2"},
    "Traveling Minstrel": {"class_id": "bard", "level": 2, "spells": "bard_2"},
    "Pilgrim": {"class_id": "cleric", "level": 2, "spells": "cleric_1", "weapons": [("quarterstaff", True)]},
    "Bouncer": {"class_id": "barbarian", "level": 2, "weapons": [("greatclub", True)]},
    "Drill Instructor": {"class_id": "fighter", "level": 3, "weapons": [("longsword", True), ("javelin", False)]},
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
        elif key == "spells":
            data.spells = value
    return data


def resolve_loadout(archetype: str, occupation: str) -> Loadout:
    base = ARCHETYPE_LOADOUTS.get(archetype) or ARCHETYPE_LOADOUTS["civilian"]
    override = OCCUPATION_LOADOUT_OVERRIDES.get(occupation)
    return _apply_override(base, override) if override else deepcopy(base)


def build_combat_items(archetype: str, occupation: str) -> list[dict[str, Any]]:
    loadout = resolve_loadout(archetype, occupation)
    items: list[dict[str, Any]] = [class_item(loadout.class_id, loadout.level, loadout.class_name)]

    for slug, equipped in loadout.armor:
        items.append(compendium_item(slug, equipped=equipped))
    for slug, equipped in loadout.weapons:
        items.append(compendium_item(slug, equipped=equipped))
    for slug in loadout.tools:
        items.append(compendium_item(slug, equipped=False))

    if loadout.spells:
        for spell_slug in SPELL_SETS.get(loadout.spells, []):
            items.append(compendium_spell(spell_slug))

    return items


def apply_combat_to_actor_data(actor_data: dict[str, Any], archetype: str, occupation: str) -> dict[str, Any]:
    data = deepcopy(actor_data)
    loadout = resolve_loadout(archetype, occupation)
    data["items"] = build_combat_items(archetype, occupation)
    prof = prof_bonus(loadout.level)
    data.setdefault("system", {}).setdefault("attributes", {})["prof"] = prof
    return data
