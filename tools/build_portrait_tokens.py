#!/usr/bin/env python3
"""Build circular portrait tokens with themed animated borders."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
THEMES_PATH = ROOT / "data" / "token-themes.json"
PORTRAITS_DIR = ROOT / "assets" / "portraits"
TOKENS_DIR = ROOT / "assets" / "tokens"
CANVAS = 512
PORTRAIT_RADIUS = 0.34  # fraction of half-canvas (portrait fits inner ~68%)
RING_INNER = 0.36
RING_OUTER = 0.48


def load_catalog() -> dict:
    return json.loads(THEMES_PATH.read_text(encoding="utf-8"))


def resolve_theme(npc: dict, catalog: dict) -> str:
    overrides = catalog.get("overrides", {})
    if npc.get("id") in overrides:
        return overrides[npc["id"]]

    tags = {str(t).lower() for t in npc.get("tags", [])}
    occupation = str(npc.get("occupation", ""))
    category = str(npc.get("category", "")).lower()

    for rule in catalog.get("rules", []):
        if any(str(tag).lower() in tags for tag in rule.get("tags", [])):
            return rule["theme"]
        if occupation in rule.get("occupations", []):
            return rule["theme"]
        if category in rule.get("categories", []):
            return rule["theme"]

    return catalog.get("defaultTheme", "commoner")


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def load_portrait(path: Path) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    # Fit portrait into square crop from top (face-forward art).
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = max(0, (h - side) // 6)  # bias slightly up for bust portraits
    top = min(top, h - side)
    cropped = img.crop((left, top, left + side, top + side))
    return cropped


def circular_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size - 1, size - 1), fill=255)
    return mask


def draw_flower(draw: ImageDraw.ImageDraw, cx: float, cy: float, size: float, color: tuple[int, int, int, int]) -> None:
    petals = 5
    for i in range(petals):
        angle = (2 * math.pi * i) / petals
        px = cx + math.cos(angle) * size * 0.55
        py = cy + math.sin(angle) * size * 0.55
        draw.ellipse((px - size * 0.35, py - size * 0.35, px + size * 0.35, py + size * 0.35), fill=color)
    draw.ellipse((cx - size * 0.22, cy - size * 0.22, cx + size * 0.22, cy + size * 0.22), fill=color)


def draw_laurel(draw: ImageDraw.ImageDraw, cx: float, cy: float, radius: float, color: tuple[int, int, int, int]) -> None:
    for i in range(8):
        angle = math.pi * 0.15 + (math.pi * 0.7 * i) / 7
        lx = cx + math.cos(angle) * radius
        ly = cy + math.sin(angle) * radius
        draw.ellipse((lx - 5, ly - 8, lx + 5, ly + 8), fill=color)


def build_frame(portrait: Image.Image, theme: dict, pulse: float) -> Image.Image:
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    center = CANVAS / 2

    bg = hex_to_rgb(theme["background"])
    ring = hex_to_rgb(theme["ring"])
    glow = hex_to_rgb(theme["ringGlow"])

    # Background disk
    bg_draw = ImageDraw.Draw(canvas)
    bg_radius = int(center * RING_OUTER * 1.02)
    bg_draw.ellipse(
        (center - bg_radius, center - bg_radius, center + bg_radius, center + bg_radius),
        fill=(*bg, 255),
    )

    # Portrait
    portrait_size = int(center * PORTRAIT_RADIUS * 2)
    fitted = portrait.resize((portrait_size, portrait_size), Image.Resampling.LANCZOS)
    mask = circular_mask(portrait_size)
    px = int(center - portrait_size / 2)
    py = int(center - portrait_size / 2)
    canvas.paste(fitted, (px, py), mask)

    # Animated glow ring
    glow_strength = 0.55 + 0.45 * pulse if theme.get("pulse") else 0.75
    ring_layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ring_draw = ImageDraw.Draw(ring_layer)
    inner = int(center * RING_INNER)
    outer = int(center * RING_OUTER * (1.0 + 0.04 * pulse))

    glow_color = (
        int(glow[0] * glow_strength + ring[0] * (1 - glow_strength)),
        int(glow[1] * glow_strength + ring[1] * (1 - glow_strength)),
        int(glow[2] * glow_strength + ring[2] * (1 - glow_strength)),
        255,
    )
    ring_draw.ellipse(
        (center - outer, center - outer, center + outer, center + outer),
        outline=glow_color,
        width=max(6, int(10 + 6 * pulse)),
    )
    ring_draw.ellipse(
        (center - inner, center - inner, center + inner, center + inner),
        outline=(*ring, 220),
        width=3,
    )
    ring_layer = ring_layer.filter(ImageFilter.GaussianBlur(radius=1.2 * pulse))
    canvas = Image.alpha_composite(canvas, ring_layer)

    decor = theme.get("decor", "none")
    if decor in {"flowers", "laurel"}:
        decor_layer = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        decor_draw = ImageDraw.Draw(decor_layer)
        decor_color = (*glow, int(180 + 60 * pulse))
        count = 8 if decor == "flowers" else 1
        for i in range(count):
            angle = (2 * math.pi * i) / count - math.pi / 2
            radius = center * (RING_OUTER + 0.03)
            fx = center + math.cos(angle) * radius
            fy = center + math.sin(angle) * radius
            if decor == "flowers":
                draw_flower(decor_draw, fx, fy, 11 + 2 * pulse, decor_color)
            else:
                draw_laurel(decor_draw, center, center - center * 0.05, radius, decor_color)
        canvas = Image.alpha_composite(canvas, decor_layer)

    return canvas


def build_token(portrait_path: Path, theme: dict, dest: Path) -> None:
    portrait = load_portrait(portrait_path)
    frames_n = max(2, int(theme.get("frames", 6)))
    fps = max(1, int(theme.get("fps", 5)))
    duration = int(1000 / fps)

    frames: list[Image.Image] = []
    for i in range(frames_n):
        pulse = 0.5 + 0.5 * math.sin((2 * math.pi * i) / frames_n)
        frames.append(build_frame(portrait, theme, pulse))

    dest.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        dest,
        save_all=True,
        append_images=frames[1:],
        duration=duration,
        loop=0,
        quality=90,
        method=6,
    )
    print(f"wrote {dest.relative_to(ROOT)} ({len(frames)} frames @ {fps}fps)")


def load_npcs() -> list[dict]:
    npcs: list[dict] = []
    for path in sorted((ROOT / "data" / "npcs").glob("*.json")):
        if path.name == "manifest.json":
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        npcs.extend(data.get("npcs", []))
    return npcs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--id", nargs="*", help="Only build these NPC ids")
    parser.add_argument("--all", action="store_true", help="Build all NPCs with portraits")
    args = parser.parse_args()

    catalog = load_catalog()
    themes = catalog["themes"]
    npcs = load_npcs()

    if args.id:
        wanted = set(args.id)
        npcs = [n for n in npcs if n["id"] in wanted]
    elif not args.all:
        parser.error("Provide --id or --all")

    built = 0
    skipped = 0
    for npc in npcs:
        npc_id = npc["id"]
        portrait = PORTRAITS_DIR / f"{npc_id}.webp"
        if not portrait.exists():
            png = PORTRAITS_DIR / f"{npc_id}.png"
            svg = PORTRAITS_DIR / f"{npc_id}.svg"
            if png.exists():
                portrait = png
            elif svg.exists():
                skipped += 1
                print(f"skip {npc_id}: SVG portrait not supported yet")
                continue
            else:
                skipped += 1
                print(f"skip {npc_id}: no portrait")
                continue

        theme_id = resolve_theme(npc, catalog)
        theme = themes[theme_id]
        dest = TOKENS_DIR / f"{npc_id}.webp"
        build_token(portrait, theme, dest)
        built += 1

    print(f"built {built}, skipped {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
