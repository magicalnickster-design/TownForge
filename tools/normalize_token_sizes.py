#!/usr/bin/env python3
"""Normalize TownForge token art to consistent in-game scale by species."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TOKENS_DIR = ROOT / "assets" / "tokens"
NPC_DIR = ROOT / "data" / "npcs"

# Fraction of the 512px canvas the character should occupy (height).
TARGET_HEIGHT = {
    "small": 0.66,   # Halfling, Dwarf
    "gnome": 0.72,   # Gnome — matches Issy Needle's good in-game size
    "medium": 0.76,  # Human, Elf, Tiefling, etc.
}

# Optional per-token multiplier after species sizing (1.0 = default).
TOKEN_SCALE: dict[str, float] = {
    "young-perrin-vale": 0.88,
    "cartographer-nym": 0.88,
    "gutter-jax": 0.82,
}

# Wide silhouettes feel oversized in the grid even at the same height.
WIDE_ASPECT_SHRINK = (
    (1.28, 0.82),
    (1.18, 0.90),
)

SMALL_SPECIES = {"Halfling", "Dwarf"}
GNOME_SPECIES = {"Gnome"}


def load_species_map() -> dict[str, str]:
    species: dict[str, str] = {}
    for path in NPC_DIR.glob("*.json"):
        if path.name == "manifest.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for npc in data.get("npcs", []):
            npc_id = npc.get("id")
            if npc_id:
                species[npc_id] = str(npc.get("species") or "Human")
    return species


def effective_target_height(species: str, npc_id: str, bbox_w: int, bbox_h: int) -> float:
    bucket = target_bucket(species)
    scale = TARGET_HEIGHT[bucket]
    if npc_id in TOKEN_SCALE:
        scale *= TOKEN_SCALE[npc_id]
    elif bucket == "medium" and bbox_h > 0:
        aspect = bbox_w / bbox_h
        for threshold, factor in WIDE_ASPECT_SHRINK:
            if aspect >= threshold:
                scale *= factor
                break
    return scale * 512


def target_bucket(species: str) -> str:
    if species in SMALL_SPECIES:
        return "small"
    if species in GNOME_SPECIES:
        return "gnome"
    return "medium"


def alpha_bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    return img.convert("RGBA").split()[3].getbbox()


def normalize_token(img: Image.Image, target_height_px: float) -> Image.Image:
    rgba = img.convert("RGBA")
    bbox = alpha_bbox(rgba)
    if not bbox:
        return rgba

    cropped = rgba.crop(bbox)
    current_h = cropped.height
    if current_h <= 0:
        return rgba

    scale = target_height_px / current_h
    new_w = max(1, round(cropped.width * scale))
    new_h = max(1, round(cropped.height * scale))
    resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    x = (canvas.width - new_w) // 2
    y = canvas.height - new_h  # bottom-align like process_npc_art.py
    if y < 0:
        y = (canvas.height - new_h) // 2
    canvas.paste(resized, (x, max(0, y)), resized)
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ids", nargs="*", help="Only normalize these NPC ids")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    species_map = load_species_map()
    token_paths = sorted(TOKENS_DIR.glob("*.webp"))
    if args.ids:
        wanted = set(args.ids)
        token_paths = [p for p in token_paths if p.stem in wanted]

    missing_species: list[str] = []
    for path in token_paths:
        npc_id = path.stem
        species = species_map.get(npc_id)
        if not species:
            missing_species.append(npc_id)
            species = "Human"
        img = Image.open(path)
        bucket = target_bucket(species)
        bbox = alpha_bbox(img)
        old_h = (bbox[3] - bbox[1]) if bbox else 0
        old_w = (bbox[2] - bbox[0]) if bbox else 0
        target_h = effective_target_height(species, npc_id, old_w, old_h)
        normalized = normalize_token(img, target_h)
        if not args.dry_run:
            normalized.save(path, "WEBP", quality=90, method=6)
        print(
            f"{npc_id:28} {species:10} {bucket:6} "
            f"h {old_h:3d}->{int(target_h):3d}px"
        )

    if missing_species:
        print(f"warning: no species for {len(missing_species)} token(s)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
