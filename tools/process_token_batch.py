#!/usr/bin/env python3
"""Process a batch of raw token PNGs and normalize to Aya reference scale."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("raw_dir", type=Path, help="Directory of *-token.png files")
    args = parser.parse_args()

    raw_dir = args.raw_dir
    if not raw_dir.is_dir():
        print(f"error: {raw_dir} is not a directory", file=sys.stderr)
        return 1

    ids: list[str] = []
    for src in sorted(raw_dir.glob("*-token.png")):
        npc_id = src.name.rsplit("-token", 1)[0]
        ids.append(npc_id)
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "tools" / "process_npc_art.py"),
                "--src",
                str(src),
                "--dest",
                str(ROOT / "assets" / "tokens" / f"{npc_id}.webp"),
            ],
            check=True,
        )

    if ids:
        subprocess.run(
            [sys.executable, str(ROOT / "tools" / "normalize_token_sizes.py"), "--ids", *ids],
            check=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
