#!/usr/bin/env python3
"""Merge feature branches into main with common conflict resolution."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.5.0"

BRANCHES = [
    "cursor/townforge-merchant-wares-drop-707e",
    "cursor/townforge-npc-scroll-portraits-707e",
    "cursor/townforge-armor-filter-fix-707e",
    "cursor/townforge-shop-dedupe-707e",
    "cursor/townforge-price-filter-50gp-707e",
    "cursor/townforge-vela-bookshop-707e",
    "cursor/townforge-block-unarmed-strike-707e",
    "cursor/townforge-npc-token-fixes-707e",
    "cursor/townforge-portrait-token-toggle-707e",
]


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, check=check, text=True, capture_output=True)


def unmerged() -> list[str]:
    result = run(["git", "diff", "--name-only", "--diff-filter=U"])
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def fix_version_files() -> None:
    module = ROOT / "module.json"
    text = module.read_text()
    text = re.sub(r'"version":\s*"[^"]*"', f'"version": "{VERSION}"', text, count=1)
    module.write_text(text)

    main_js = ROOT / "scripts" / "main.js"
    text = main_js.read_text()
    text = re.sub(r'\?\? "0\.[0-9.]+"', f'?? "{VERSION}"', text)
    main_js.write_text(text)


def fix_test_imports(path: Path) -> bool:
    text = path.read_text()
    if "<<<<<<<" not in text:
        return False
    imports: list[str] = []
    for block in re.findall(r"<<<<<<<.*?>>>>>>> [^\n]+", text, flags=re.S):
        for line in block.splitlines():
            if line.startswith("import ") or line.startswith("} from "):
                imports.append(line)
            elif line.startswith("import {") or line.startswith("import {"):
                imports.append(line)
        for match in re.finditer(r"(import[\s\S]*?;\n)", block):
            imports.append(match.group(1))
    # Simpler: collect unique import statements from both sides
    seen = set()
    merged_imports: list[str] = []
    for side in re.split(r"<<<<<<< HEAD|=======|>>>>>>> [^\n]+", text):
        if "import " not in side:
            continue
        for stmt in re.findall(r"import[\s\S]*?;\n", side):
            if stmt not in seen:
                seen.add(stmt)
                merged_imports.append(stmt)
    cleaned = re.sub(r"<<<<<<< HEAD[\s\S]*?>>>>>>> [^\n]+\n?", "", text)
    # Replace leading import block
    body = re.sub(r"^(?:import[\s\S]*?;\n)+", "", cleaned, count=1)
    path.write_text("".join(merged_imports) + body)
    return True


def resolve_conflicts() -> list[str]:
    files = unmerged()
    for rel in files:
        path = ROOT / rel
        if rel in {"module.json", "scripts/main.js"}:
            run(["git", "checkout", "--ours", rel])
            fix_version_files()
            run(["git", "add", rel])
            continue
        if rel == "tools/test_shop_logic.mjs":
            fix_test_imports(path)
            if "<<<<<<<" in path.read_text():
                return [rel]
            run(["git", "add", rel])
            continue
        return files
    fix_version_files()
    run(["git", "add", "module.json", "scripts/main.js"], check=False)
    return unmerged()


def main() -> int:
    # Finish in-progress merge if present
    if unmerged():
        remaining = resolve_conflicts()
        if remaining:
            print("Unresolved:", remaining)
            return 1
        run(["git", "commit", "--no-edit"], check=False)
        if unmerged():
            run(["git", "commit", "-m", "Merge in-progress branch into main"])

    for branch in BRANCHES:
        print(f">>> {branch}")
        if run(["git", "merge", "--no-edit", f"origin/{branch}"], check=False).returncode == 0:
            fix_version_files()
            run(["git", "add", "module.json", "scripts/main.js"], check=False)
            run(["git", "commit", "--amend", "--no-edit"], check=False)
            print(f"OK {branch}")
            continue
        remaining = resolve_conflicts()
        if remaining:
            print(f"FAILED {branch}: {remaining}")
            return 1
        run(["git", "commit", "-m", f"Merge {branch} into main"])
        print(f"MERGED {branch}")

    print("ALL DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
