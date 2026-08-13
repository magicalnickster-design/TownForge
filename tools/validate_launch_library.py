#!/usr/bin/env python3
"""Validate TownForge v0.2 launch library NPC packs."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NPC_DIR = ROOT / "data" / "npcs"
MANIFEST_PATH = NPC_DIR / "manifest.json"

EXPECTED_COUNTS = {
    "tavern": 9,
    "shops": 11,
    "guards": 10,
    "nobility": 8,
    "commoners": 12,
    "religious": 8,
    "criminal": 8,
    "scholars": 7,
    "travelers": 7,
    "craftsmen": 10,
    "government": 6,
    "miscellaneous": 4,
}

REQUIRED_FIELDS = [
    "id",
    "name",
    "species",
    "gender",
    "age",
    "occupation",
    "category",
    "tags",
    "description",
    "biography",
    "personality",
    "motivation",
    "secret",
    "rumor",
    "voice",
    "appearance",
    "portrait",
    "token",
    "actorData",
]

KEBAB = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def load_manifest() -> dict:
    with MANIFEST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_packs(manifest: dict) -> list[tuple[str, dict]]:
    packs = []
    for filename in manifest.get("packs", []):
        path = NPC_DIR / filename
        with path.open(encoding="utf-8") as fh:
            packs.append((filename, json.load(fh)))
    return packs


def validate_npc(npc: dict, pack_category: str) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if field not in npc:
            errors.append(f"missing field '{field}'")

    npc_id = npc.get("id")
    if not isinstance(npc_id, str) or not KEBAB.match(npc_id):
        errors.append("id must be kebab-case string")

    if not isinstance(npc.get("name"), str) or not npc.get("name", "").strip():
        errors.append("name must be non-empty string")

    if not isinstance(npc.get("species"), str) or not npc.get("species"):
        errors.append("species must be non-empty string")

    if not isinstance(npc.get("gender"), str) or not npc.get("gender"):
        errors.append("gender must be non-empty string")

    if not isinstance(npc.get("age"), (int, float)) or npc.get("age", 0) <= 0:
        errors.append("age must be a positive number")

    if not isinstance(npc.get("occupation"), str) or not npc.get("occupation"):
        errors.append("occupation must be non-empty string")

    category = npc.get("category")
    if category != pack_category:
        errors.append(f"category '{category}' != pack '{pack_category}'")

    tags = npc.get("tags")
    if not isinstance(tags, list) or not (2 <= len(tags) <= 5) or not all(isinstance(t, str) for t in tags):
        errors.append("tags must be array of 2-5 strings")

    if not isinstance(npc.get("description"), str) or not npc.get("description", "").strip():
        errors.append("description must be non-empty string")

    bio = npc.get("biography", "")
    if not isinstance(bio, str):
        errors.append("biography must be string")
    else:
        wc = word_count(bio)
        if wc < 75 or wc > 125:
            errors.append(f"biography word count {wc} outside 75-125")

    for field in ("personality", "motivation", "secret", "rumor", "voice", "appearance"):
        if not isinstance(npc.get(field), str) or not str(npc.get(field, "")).strip():
            errors.append(f"{field} must be non-empty string")

    expected_portrait = f"modules/townforge/assets/portraits/{npc_id}.webp"
    expected_token = f"modules/townforge/assets/tokens/{npc_id}.webp"
    if npc.get("portrait") != expected_portrait:
        errors.append("portrait path mismatch")
    if npc.get("token") != expected_token:
        errors.append("token path mismatch")

    actor = npc.get("actorData")
    if not isinstance(actor, dict):
        errors.append("actorData must be object")
    elif actor.get("type") != "npc":
        errors.append("actorData.type must be 'npc'")
    elif not isinstance(actor.get("system"), dict):
        errors.append("actorData.system must be object")

    relationships = npc.get("relationships")
    if relationships is not None:
        if not isinstance(relationships, list):
            errors.append("relationships must be array when present")
        else:
            for rel in relationships:
                if not isinstance(rel, dict):
                    errors.append("relationship entries must be objects")
                    continue
                for key in ("id", "type", "note"):
                    if key not in rel or not isinstance(rel[key], str) or not rel[key].strip():
                        errors.append(f"relationship missing valid '{key}'")

    return errors


def main() -> int:
    if not MANIFEST_PATH.exists():
        print("ERROR: manifest.json missing")
        return 1

    manifest = load_manifest()
    packs = load_packs(manifest)

    all_npcs: list[dict] = []
    invalid: list[tuple[str, list[str]]] = []
    category_counts: Counter[str] = Counter()
    ids: list[str] = []
    names: list[str] = []
    bio_outliers: list[tuple[str, int]] = []
    portrait_ok = 0
    token_ok = 0
    actor_ok = 0
    relationship_ids: set[str] = set()
    linked_pairs: set[tuple[str, str]] = set()

    for filename, pack in packs:
        pack_category = pack.get("category")
        if pack_category != Path(filename).stem:
            print(f"WARN: pack category '{pack_category}' != filename stem '{Path(filename).stem}'")
        for npc in pack.get("npcs", []):
            all_npcs.append(npc)
            category_counts[npc.get("category", "?")] += 1
            ids.append(npc.get("id", ""))
            names.append(npc.get("name", ""))
            errs = validate_npc(npc, pack_category)
            if errs:
                invalid.append((npc.get("id", "<no-id>"), errs))
            else:
                # counted as valid below
                pass

            npc_id = npc.get("id")
            if npc.get("portrait") == f"modules/townforge/assets/portraits/{npc_id}.webp":
                portrait_ok += 1
            if npc.get("token") == f"modules/townforge/assets/tokens/{npc_id}.webp":
                token_ok += 1
            actor = npc.get("actorData")
            if isinstance(actor, dict) and actor.get("type") == "npc" and isinstance(actor.get("system"), dict):
                actor_ok += 1

            wc = word_count(npc.get("biography", "")) if isinstance(npc.get("biography"), str) else -1
            if wc < 75 or wc > 125:
                bio_outliers.append((str(npc_id), wc))

            for rel in npc.get("relationships") or []:
                if isinstance(rel, dict) and isinstance(rel.get("id"), str):
                    relationship_ids.add(rel["id"])
                    a, b = sorted([str(npc_id), rel["id"]])
                    linked_pairs.add((a, b))

    total = len(all_npcs)
    valid = total - len(invalid)
    id_counts = Counter(ids)
    name_counts = Counter(names)
    dup_ids = sorted([i for i, c in id_counts.items() if i and c > 1])
    dup_names = sorted([n for n, c in name_counts.items() if n and c > 1])

    print("=== TownForge Launch Library Validation ===")
    print(f"Total NPCs: {total}")
    print(f"Valid count: {valid}")
    print(f"Invalid count: {len(invalid)}")
    if invalid:
        print("Invalid reasons:")
        for npc_id, errs in invalid[:40]:
            print(f"  - {npc_id}: {'; '.join(errs)}")
        if len(invalid) > 40:
            print(f"  ... and {len(invalid) - 40} more")
    print(f"Duplicate IDs: {len(dup_ids)}")
    if dup_ids:
        print(f"  {dup_ids}")
    print(f"Duplicate names: {len(dup_names)}")
    if dup_names:
        print(f"  {dup_names}")
    print("Category counts:")
    for category in EXPECTED_COUNTS:
        got = category_counts.get(category, 0)
        expected = EXPECTED_COUNTS[category]
        mark = "OK" if got == expected else "MISMATCH"
        print(f"  {category}: {got} (expected {expected}) [{mark}]")
    extras = sorted(set(category_counts) - set(EXPECTED_COUNTS))
    if extras:
        print(f"  Unexpected categories: {extras}")
    print(f"Portrait path convention OK: {portrait_ok}/{total}")
    print(f"Token path convention OK: {token_ok}/{total}")
    print(f"actorData present & typed OK: {actor_ok}/{total}")
    print(f"Biography word count outliers: {len(bio_outliers)}")
    if bio_outliers:
        for npc_id, wc in bio_outliers[:30]:
            print(f"  - {npc_id}: {wc} words")
        if len(bio_outliers) > 30:
            print(f"  ... and {len(bio_outliers) - 30} more")
    print(f"Linked relationship pairs: {len(linked_pairs)}")

    leftover = ROOT / "data" / "npcs.json"
    if leftover.exists():
        print("WARN: leftover data/npcs.json still present")

    ok = (
        total == 100
        and valid == 100
        and not dup_ids
        and not dup_names
        and all(category_counts.get(c, 0) == n for c, n in EXPECTED_COUNTS.items())
        and portrait_ok == total
        and token_ok == total
        and actor_ok == total
        and not bio_outliers
    )
    print(f"RESULT: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
