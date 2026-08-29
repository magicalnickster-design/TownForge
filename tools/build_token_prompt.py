#!/usr/bin/env python3
"""Build standardized top-down token prompts for TownForge NPCs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NPC_DIR = ROOT / "data" / "npcs"
REFERENCE_TOKEN = ROOT / "assets" / "tokens" / "aya-swiftquiver.webp"

PROMPT_TEMPLATE = """Top-down bird's-eye view tabletop RPG character token, square format. Camera directly overhead, looking straight down at the character like a battle-map miniature.

FRAMING (match the reference token camera angle and body framing when a reference is provided):
- The center of the character's HEAD (between the ears, at nose level) must be the exact center of the image.
- Standing upright, seen from directly above.
- Show the nose and forehead from above; do NOT show the mouth or chin (face angled slightly downward).
- Show the tops of the shoulders, upper arms, hands near the sides, and some of the upper chest.
- Do NOT show the belly or lower torso unless the character is very fat.
- Do NOT show thighs or legs; crop around the upper shins.
- Show only the front half of both feet at the bottom (forefoot/toes visible from above).
- Arms relaxed at the sides; hands visible near the hips.

Character: {name}, {age}-year-old {species} {gender}, {occupation}. {appearance}

Painterly fantasy illustration style. Plain neutral background suitable for transparency. CHARACTER ONLY — no weapons, tools, carried props, furniture, floor tiles, shadows, text, or decorative border. Ignore any weapons, tools, or held objects mentioned in the character description; draw the character empty-handed with nothing carried or worn as gear beyond clothing.

CRITICAL: True top-down bird's-eye view only. Do not use three-quarter view. Do not show the face looking up at the camera."""


def load_npcs() -> list[dict]:
    npcs: list[dict] = []
    for path in sorted(NPC_DIR.glob("*.json")):
        if path.name == "manifest.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        npcs.extend(data.get("npcs", []))
    return sorted(npcs, key=lambda n: n["id"])


def build_prompt(npc: dict) -> str:
    appearance = str(npc.get("appearance") or npc.get("description") or "").strip()
    if not appearance.endswith("."):
        appearance += "."
    return PROMPT_TEMPLATE.format(
        name=npc.get("name", npc["id"]),
        age=npc.get("age", "adult"),
        species=npc.get("species", "Human"),
        gender=npc.get("gender", ""),
        occupation=npc.get("occupation", "townsperson"),
        appearance=appearance,
    )


def reference_paths(npc_id: str) -> list[str]:
    paths: list[str] = []
    portrait = ROOT / "assets" / "portraits" / f"{npc_id}.webp"
    if npc_id != "aya-swiftquiver" and REFERENCE_TOKEN.is_file():
        paths.append(str(REFERENCE_TOKEN))
    if portrait.is_file():
        paths.append(str(portrait))
    return paths


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", help="Single NPC id")
    parser.add_argument("--batch", type=int, default=0, help="Batch number (10 per batch)")
    parser.add_argument("--batch-size", type=int, default=10)
    parser.add_argument("--all", action="store_true", help="Output every NPC (with --json)")
    parser.add_argument("--list", action="store_true", help="List all NPC ids")
    parser.add_argument("--json", action="store_true", help="Output JSON for batch tooling")
    args = parser.parse_args()

    npcs = load_npcs()

    if args.list:
        for npc in npcs:
            print(npc["id"])
        return 0

    if args.id:
        match = [n for n in npcs if n["id"] == args.id]
        if not match:
            raise SystemExit(f"unknown npc id: {args.id}")
        print(build_prompt(match[0]))
        return 0

    if args.all:
        batch = npcs
    else:
        start = args.batch * args.batch_size
        batch = npcs[start : start + args.batch_size]

    if args.json:
        payload = []
        for npc in batch:
            payload.append(
                {
                    "id": npc["id"],
                    "prompt": build_prompt(npc),
                    "filename": f"{npc['id']}-token.png",
                    "reference_image_paths": reference_paths(npc["id"]),
                }
            )
        print(json.dumps(payload, indent=2))
    else:
        for npc in batch:
            print(f"=== {npc['id']} ===")
            print(build_prompt(npc))
            print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
