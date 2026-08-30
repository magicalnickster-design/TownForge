#!/usr/bin/env python3
"""Tests for TownForge NPC combat loadouts."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHOP_ONLY_NPCS = frozenset({"vela-inkwell", "garr-hopsack", "hedda-loom", "marrow-cline"})
sys.path.insert(0, str(ROOT / "tools"))

from build_launch_library import OCC_ARCH
from npc_combat_loadouts import apply_combat_to_actor_data, build_combat_items, estimate_hp, resolve_loadout


def main() -> int:
    rook = resolve_loadout("criminal", "Fence")
    assert rook.class_id == "rogue", "rook is rogue"
    assert rook.level == 3, "rook level 3"
    rook_items = build_combat_items("criminal", "Fence")
    assert any(i.get("compendium", "").endswith(".shortsword") for i in rook_items), "rook has shortsword"
    assert any(i.get("type") == "class" for i in rook_items), "rook has class"

    mage = resolve_loadout("mage", "Town Mage")
    assert mage.class_id == "wizard" and mage.level == 5
    mage_items = build_combat_items("mage", "Town Mage")
    spell_uuids = [i["compendium"] for i in mage_items if i.get("type") == "spell"]
    assert any("fireball" in u for u in spell_uuids), "town mage has fireball"
    assert any("fire-bolt" in u for u in spell_uuids), "town mage has cantrip"

    oracle_items = build_combat_items("mage", "Oracle")
    assert any(i.get("system", {}).get("identifier") == "sorcerer" for i in oracle_items if i.get("type") == "class")

    bailiff = resolve_loadout("official", "Bailiff")
    assert bailiff.level == 4 and bailiff.class_id == "fighter"
    bailiff_items = build_combat_items("official", "Bailiff")
    assert len(bailiff_items) >= 8, "bailiff has expanded loadout"
    assert any(i.get("type") == "spell" for i in build_combat_items("mage", "Town Mage"))

    # Every NPC pack should have compendium-backed combat items after enrichment.
    for path in sorted((ROOT / "data" / "npcs").glob("*.json")):
        if path.name == "manifest.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for npc in data.get("npcs", []):
            if npc["id"] in SHOP_ONLY_NPCS:
                continue
            items = npc.get("actorData", {}).get("items", [])
            assert items, f"{npc['id']} missing combat items"
            assert any(i.get("type") == "class" for i in items), f"{npc['id']} missing class item"
            archetype = OCC_ARCH.get(npc.get("occupation", ""), "civilian")
            if archetype in {"mage", "priest", "scholar", "noble", "traveler"} or npc.get("occupation") in {
                "Oracle",
                "Town Mage",
                "Acolyte",
                "Evening Singer",
                "Temple Priestess",
                "Magistrate",
                "Town Mayor",
                "Apothecary Clerk",
                "Alchemist",
            }:
                assert any(i.get("type") == "spell" for i in items), f"{npc['id']} missing spells"
            cls = next(i for i in items if i.get("type") == "class")
            level = cls.get("system", {}).get("levels", 1)
            hp = npc.get("actorData", {}).get("system", {}).get("attributes", {}).get("hp", {}).get("max", 0)
            con = npc.get("actorData", {}).get("system", {}).get("abilities", {}).get("con", {}).get("value", 10)
            expected_hp = estimate_hp(cls.get("system", {}).get("identifier", "commoner"), level, con)
            assert hp == expected_hp, f"{npc['id']} hp {hp} != expected {expected_hp} for level {level}"
            assert npc.get("actorData", {}).get("system", {}).get("details", {}).get("level") == level, (
                f"{npc['id']} details.level mismatch"
            )

    print("OK: npc combat loadout tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
