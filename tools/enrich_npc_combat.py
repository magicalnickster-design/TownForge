#!/usr/bin/env python3
"""Apply dnd5e combat loadouts (classes, compendium gear, spells) to all TownForge NPCs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NPC_DIR = ROOT / "data" / "npcs"
sys.path.insert(0, str(ROOT / "tools"))

from build_launch_library import OCC_ARCH
from npc_combat_loadouts import apply_combat_to_actor_data, build_combat_items


def main() -> int:
    updated = 0
    for path in sorted(NPC_DIR.glob("*.json")):
        if path.name == "manifest.json":
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        changed = False
        for npc in payload.get("npcs", []):
            occupation = npc.get("occupation", "")
            archetype = OCC_ARCH.get(occupation, "civilian")
            actor_data = npc.get("actorData")
            if not isinstance(actor_data, dict):
                continue
            next_data = apply_combat_to_actor_data(actor_data, archetype, occupation)
            if next_data != actor_data:
                npc["actorData"] = next_data
                changed = True
                updated += 1
        if changed:
            path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"updated {path.name}")
    print(f"OK: enriched combat loadouts on {updated} NPCs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
