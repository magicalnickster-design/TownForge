#!/usr/bin/env python3
"""
Convert generated NPC art into transparent WebP assets for TownForge.
Usage:
  python3 tools/process_npc_art.py --src /path/to/raw.png --dest assets/portraits/id.webp
  python3 tools/process_npc_art.py --batch /tmp/npc-art-raw
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

from PIL import Image
from rembg import remove


ROOT = Path(__file__).resolve().parents[1]


def to_transparent_webp(src: Path, dest: Path, size: tuple[int, int] | None = None) -> None:
    raw = src.read_bytes()
    cut = remove(raw)
    img = Image.open(io.BytesIO(cut)).convert("RGBA")
    if size:
        img.thumbnail(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        x = (size[0] - img.width) // 2
        y = size[1] - img.height  # bottom-align portraits/tokens
        if y < 0:
            y = (size[1] - img.height) // 2
        canvas.paste(img, (x, max(0, y)), img)
        img = canvas
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=90, method=6)
    print(f"wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path)
    parser.add_argument("--dest", type=Path)
    parser.add_argument("--batch", type=Path, help="Folder of *-portrait.png / *-token.png")
    parser.add_argument("--portrait-size", default="768x1024")
    parser.add_argument("--token-size", default="512x512")
    args = parser.parse_args()

    def parse_size(text: str) -> tuple[int, int]:
        w, h = text.lower().split("x")
        return int(w), int(h)

    portrait_size = parse_size(args.portrait_size)
    token_size = parse_size(args.token_size)

    if args.batch:
        raw_dir = args.batch
        for src in sorted(raw_dir.glob("*-portrait.*")):
            npc_id = src.name.rsplit("-portrait", 1)[0]
            to_transparent_webp(src, ROOT / "assets" / "portraits" / f"{npc_id}.webp", portrait_size)
        for src in sorted(raw_dir.glob("*-token.*")):
            npc_id = src.name.rsplit("-token", 1)[0]
            to_transparent_webp(src, ROOT / "assets" / "tokens" / f"{npc_id}.webp", token_size)
        return 0

    if not args.src or not args.dest:
        parser.error("Provide --src/--dest or --batch")
    size = portrait_size if "portrait" in args.dest.name or "portraits" in str(args.dest) else token_size
    to_transparent_webp(args.src, args.dest if args.dest.is_absolute() else ROOT / args.dest, size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
