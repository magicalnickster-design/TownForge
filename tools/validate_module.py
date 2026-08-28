#!/usr/bin/env python3
"""Validate TownForge module.json and required install files."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "module.json"
CONFLICT_RE = re.compile(r"^(<<<<<<<|=======|>>>>>>>)")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def check_no_conflict_markers(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for line_no, line in enumerate(text.splitlines(), start=1):
        if CONFLICT_RE.match(line.strip()):
            fail(f"{path.relative_to(ROOT)}:{line_no} contains git conflict marker")


def main() -> int:
    if not MANIFEST.is_file():
        fail("module.json is missing")

    check_no_conflict_markers(MANIFEST)

    try:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"module.json is invalid JSON: {exc}")

    module_id = manifest.get("id")
    if module_id != "townforge":
        fail(f'module id must be "townforge", got {module_id!r}')

    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        fail("module version must be a non-empty string")

    for key in ("esmodules", "styles"):
        entries = manifest.get(key, [])
        if not isinstance(entries, list) or not entries:
            fail(f"{key} must be a non-empty array")
        for rel in entries:
            path = ROOT / rel
            if not path.is_file():
                fail(f"manifest {key} entry missing: {rel}")
            if path.suffix == ".js":
                check_no_conflict_markers(path)

    minimum = manifest.get("compatibility", {}).get("minimum")
    if str(minimum) < "13":
        fail(f'compatibility.minimum must be "13" or newer, got {minimum!r}')

    # Entry script should not eagerly import ApplicationV2 consumers.
    main_js = (ROOT / "scripts" / "main.js").read_text(encoding="utf-8")
    eager_imports = [
        line.strip()
        for line in main_js.splitlines()
        if line.startswith("import ")
        and 'from "./' in line
        and not any(
            allowed in line
            for allowed in ("constants.js", "scene-control.js")
        )
    ]
    if eager_imports:
        fail(
            "scripts/main.js must lazy-load feature modules inside hooks; "
            f"found eager imports: {eager_imports}"
        )

    print(f"OK: TownForge v{version} manifest and install files look valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
