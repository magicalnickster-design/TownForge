"""dnd5e-oriented actorData builders for TownForge launch NPCs."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def _abilities(str_=10, dex=10, con=10, int_=10, wis=10, cha=10) -> dict[str, Any]:
    return {
        "str": {"value": str_},
        "dex": {"value": dex},
        "con": {"value": con},
        "int": {"value": int_},
        "wis": {"value": wis},
        "cha": {"value": cha},
    }


def _skills(**profs: int) -> dict[str, Any]:
    # dnd5e uses abbreviated keys; value 1 ~= proficient in common schemas.
    return {key: {"value": value} for key, value in profs.items()}


def _weapon(name: str, damage: str, dtype: str, weapon_type: str = "simpleM") -> dict[str, Any]:
    return {
        "name": name,
        "type": "weapon",
        "img": "icons/svg/sword.svg",
        "system": {
            "quantity": 1,
            "equipped": True,
            "type": {"value": weapon_type},
            "damage": {"parts": [[damage, dtype]]},
            "actionType": "mwak",
        },
    }


def _armor(name: str, ac: int, armor_type: str = "light") -> dict[str, Any]:
    return {
        "name": name,
        "type": "equipment",
        "img": "icons/svg/shield.svg",
        "system": {
            "quantity": 1,
            "equipped": True,
            "type": {"value": armor_type},
            "armor": {"value": ac, "dex": 2 if armor_type == "light" else 0},
        },
    }


def _tool(name: str) -> dict[str, Any]:
    return {
        "name": name,
        "type": "tool",
        "img": "icons/svg/eye.svg",
        "system": {"quantity": 1},
    }


def base_npc(
    *,
    subtype: str,
    abilities: dict[str, Any],
    ac: int,
    hp: int,
    cr: float | int,
    speed: int = 30,
    prof: int = 2,
    skills: dict[str, Any] | None = None,
    languages: list[str] | None = None,
    senses: dict[str, Any] | None = None,
    items: list[dict[str, Any]] | None = None,
    alignment: str = "neutral",
    size: str = "med",
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "type": "npc",
        "system": {
            "abilities": abilities,
            "attributes": {
                "ac": {"flat": ac, "calc": "flat"},
                "hp": {"value": hp, "max": hp},
                "movement": {"walk": speed, "units": "ft"},
                "senses": senses
                or {
                    "darkvision": 0,
                    "blindsight": 0,
                    "tremorsense": 0,
                    "truesight": 0,
                },
                "prof": prof,
            },
            "details": {
                "cr": cr,
                "alignment": alignment,
                "type": {"value": "humanoid", "subtype": subtype.lower()},
            },
            "traits": {
                "size": size,
                "languages": {"value": languages or ["common"]},
            },
            "skills": skills or {},
        },
    }
    if items:
        data["items"] = items
    return data


ARCHETYPES: dict[str, Any] = {
    "civilian": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(10, 10, 10, 10, 11, 11),
        ac=10,
        hp=4,
        cr=0,
        skills=_skills(prc=1),
        items=[],
    ),
    "innkeeper": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(10, 11, 12, 11, 12, 14),
        ac=11,
        hp=9,
        cr=0.125,
        skills=_skills(per=1, prc=1, ins=1),
        items=[_tool("Brewer's Supplies")],
    ),
    "merchant": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(10, 12, 11, 13, 12, 14),
        ac=11,
        hp=8,
        cr=0.125,
        skills=_skills(per=1, ins=1, inv=1),
        items=[_tool("Merchant's Scale")],
    ),
    "guard": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(14, 12, 14, 10, 11, 10),
        ac=16,
        hp=16,
        cr=0.5,
        prof=2,
        skills=_skills(ath=1, prc=1, intimidation=1),
        items=[
            _armor("Chain Shirt", 13, "medium"),
            _weapon("Spear", "1d6", "piercing"),
            _weapon("Shortsword", "1d6", "piercing", "martialM"),
        ],
    ),
    "guard_captain": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(15, 13, 14, 11, 13, 12),
        ac=17,
        hp=32,
        cr=1,
        prof=2,
        skills=_skills(ath=1, prc=1, ins=1, per=1),
        items=[
            _armor("Breastplate", 14, "medium"),
            _weapon("Longsword", "1d8", "slashing", "martialM"),
            _weapon("Light Crossbow", "1d8", "piercing", "simpleR"),
        ],
    ),
    "noble": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(10, 12, 11, 13, 12, 15),
        ac=12,
        hp=12,
        cr=0.25,
        skills=_skills(per=1, his=1, ins=1),
        items=[_weapon("Rapier", "1d8", "piercing", "martialM")],
        alignment="lawful neutral",
    ),
    "priest": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(10, 10, 12, 11, 15, 13),
        ac=13,
        hp=14,
        cr=0.5,
        skills=_skills(rel=1, med=1, per=1, ins=1),
        items=[_armor("Holy Vestments", 1, "clothing"), _weapon("Mace", "1d6", "bludgeoning")],
        alignment="lawful good",
    ),
    "criminal": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(11, 15, 12, 12, 11, 13),
        ac=13,
        hp=11,
        cr=0.25,
        skills=_skills(ste=1, slt=1, dec=1, prc=1),
        items=[_weapon("Dagger", "1d4", "piercing"), _weapon("Shortsword", "1d6", "piercing", "martialM")],
        alignment="chaotic neutral",
    ),
    "scholar": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(8, 11, 10, 16, 13, 12),
        ac=11,
        hp=7,
        cr=0.125,
        skills=_skills(arc=1, his=1, inv=1, nat=1),
        items=[_tool("Scholar's Kit")],
    ),
    "mage": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(8, 13, 12, 16, 12, 11),
        ac=12,
        hp=18,
        cr=1,
        skills=_skills(arc=1, his=1, inv=1),
        items=[_weapon("Quarterstaff", "1d6", "bludgeoning"), _tool("Component Pouch")],
        alignment="neutral",
    ),
    "craftsman": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(14, 12, 13, 11, 12, 10),
        ac=12,
        hp=12,
        cr=0.25,
        skills=_skills(ath=1, inv=1),
        items=[_tool("Artisan's Tools"), _weapon("Light Hammer", "1d4", "bludgeoning")],
    ),
    "blacksmith": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(16, 11, 14, 10, 11, 10),
        ac=13,
        hp=18,
        cr=0.5,
        skills=_skills(ath=1, inv=1),
        items=[
            _tool("Smith's Tools"),
            _armor("Smith's Apron", 1, "clothing"),
            _weapon("Warhammer", "1d8", "bludgeoning", "martialM"),
        ],
    ),
    "traveler": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(12, 14, 12, 11, 13, 12),
        ac=13,
        hp=11,
        cr=0.25,
        skills=_skills(sur=1, prc=1, ath=1),
        items=[_weapon("Shortsword", "1d6", "piercing", "martialM"), _tool("Traveler's Pack")],
    ),
    "official": lambda species: base_npc(
        subtype=species,
        abilities=_abilities(10, 11, 12, 13, 14, 13),
        ac=11,
        hp=10,
        cr=0.125,
        skills=_skills(ins=1, per=1, his=1),
        items=[_tool("Ledger and Seal")],
        alignment="lawful neutral",
    ),
}


def build_actor_data(archetype: str, species: str, overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    factory = ARCHETYPES.get(archetype) or ARCHETYPES["civilian"]
    data = deepcopy(factory(species))
    if overrides:
        # Shallow/deep merge for targeted tweaks.
        for key, value in overrides.items():
            if key == "system" and isinstance(value, dict):
                for skey, svalue in value.items():
                    if isinstance(svalue, dict) and isinstance(data["system"].get(skey), dict):
                        data["system"][skey] = {**data["system"][skey], **svalue}
                    else:
                        data["system"][skey] = svalue
            else:
                data[key] = value
    return data
