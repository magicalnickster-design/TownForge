#!/usr/bin/env python3
"""Sanity checks for top-down token prompt template."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from build_token_prompt import PROMPT_TEMPLATE, build_prompt, load_npcs


def main() -> int:
    sample = build_prompt(load_npcs()[0])
    required = [
        "bird's-eye",
        "center of the character's HEAD",
        "do NOT show the mouth",
        "front half of both feet",
        "CHARACTER ONLY",
        "no weapons",
    ]
    missing = [phrase for phrase in required if phrase not in sample]
    if missing:
        print("missing prompt phrases:", ", ".join(missing), file=sys.stderr)
        return 1
    if "{" in sample and "}" in sample:
        print("unfilled template placeholder in built prompt", file=sys.stderr)
        return 1
    print(f"OK: token prompt checks passed ({len(load_npcs())} NPCs)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
