#!/usr/bin/env python3
"""Mirror token theme resolution for build tooling tests."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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


def main() -> int:
    catalog = json.loads((ROOT / "data" / "token-themes.json").read_text(encoding="utf-8"))
    pippa = {
        "id": "pippa-reed",
        "occupation": "Barmaid",
        "category": "tavern",
        "tags": ["server", "eager", "employee"],
    }
    assert resolve_theme(pippa, catalog) == "charming", "pippa should be charming"
    guard = {"id": "serra-dawnpike", "category": "guards", "tags": []}
    assert resolve_theme(guard, catalog) == "guard", "guard category"
    print("token theme tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
