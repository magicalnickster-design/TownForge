#!/usr/bin/env python3
"""Rebuild TownForge launch library packs from roster_snapshot.json + npc_facts.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

from actor_builders import build_actor_data

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "npcs"
ROSTER_PATH = Path(__file__).resolve().parent / "roster_snapshot.json"
FACTS_PATH = Path(__file__).resolve().parent / "npc_facts.json"

CATEGORIES = [
    "tavern","shops","guards","nobility","commoners","religious",
    "criminal","scholars","travelers","craftsmen","government","miscellaneous",
]

# Map occupation/category to archetype for rebuilds when needed
OCC_ARCH = {
    "Tavern Keeper": "innkeeper", "Cellar Master": "innkeeper", "Barmaid": "civilian",
    "Bouncer": "guard", "Fireplace Regular": "civilian", "Wine Seller": "merchant",
    "Taproom Cook": "craftsman", "Evening Singer": "civilian", "Dice Dealer": "criminal",
    "General Store Owner": "merchant", "Shop Clerk": "merchant", "Moneylender": "merchant",
    "Clothier": "merchant", "Spice Merchant": "merchant", "Bookstore Owner": "scholar",
    "Grain Dealer": "merchant", "Haberdasher": "merchant", "Chandler": "craftsman",
    "Apothecary Clerk": "scholar", "Pawnbroker": "merchant",
    "City Guard Captain": "guard_captain", "Junior Guard": "guard", "Gate Sergeant": "guard",
    "Wall Archer": "guard", "Watch Investigator": "guard", "Riot Shield Guard": "guard",
    "Night Patrol Lead": "guard", "Armory Warden": "guard", "Undercover Watcher": "criminal",
    "Drill Instructor": "guard",
    "Noble Patron": "noble", "Estate Hostess": "noble", "Knight Retainer": "guard_captain",
    "Court Gossip": "noble", "Mining Magnate": "noble", "Lady-in-Waiting": "civilian",
    "Heir Apparent": "civilian", "Salon Patron": "noble",
    "Street Sweep": "civilian", "Carter": "civilian", "Laundry Worker": "civilian",
    "Messenger Boy": "traveler", "Well Keeper": "civilian", "Stable Hand": "civilian",
    "Chimney Sweep": "civilian", "Street Peddler": "merchant", "Dock Hauler": "civilian",
    "Seamstress": "craftsman", "Baker's Assistant": "civilian", "Herb Gatherer": "traveler",
    "Temple Priestess": "priest", "Temple Archivist": "scholar", "Alms Keeper": "priest",
    "Funeral Priest": "priest", "Acolyte": "civilian", "Oracle": "mage",
    "Cloister Monk": "priest", "Guard Chaplain": "priest",
    "Fence": "criminal", "Pickpocket": "criminal", "Lookout": "criminal", "Smuggler": "criminal",
    "Forgery Clerk": "scholar", "Information Broker": "criminal", "Debt Collector": "guard",
    "Sewer Runner": "criminal",
    "Town Mage": "mage", "Public Scribe": "scholar", "Library Archivist": "scholar",
    "Alchemist": "mage", "Children's Tutor": "scholar", "Cartographer": "scholar",
    "Town Historian": "scholar",
    "Caravan Master": "traveler", "Wilderness Scout": "traveler", "Traveling Minstrel": "civilian",
    "Pilgrim": "priest", "River Sailor": "traveler", "Game Hunter": "traveler",
    "Long-Road Courier": "traveler",
    "Blacksmith": "blacksmith", "Cooper": "craftsman", "Potter": "craftsman",
    "Carpenter": "craftsman", "Cobbler": "craftsman", "Fletcher": "craftsman",
    "Baker": "civilian", "Tinker": "craftsman", "Weaver": "craftsman", "Stonemason": "craftsman",
    "Town Mayor": "official", "Town Clerk": "official", "Bailiff": "official",
    "Tax Assessor": "official", "Magistrate": "official", "Town Herald": "civilian",
    "Midwife": "civilian", "Gravedigger": "civilian", "Ratcatcher": "criminal", "Matchmaker": "civilian",
}


def wc(text: str) -> int:
    return len(re.findall(r"\b[\w']+\b", text or ""))


def compose_biography(n: dict, facts: dict) -> str:
    name, species, age, occupation = n["name"], n["species"], n["age"], n["occupation"]
    first = name.split()[0]
    place, habit, obj = facts["place"], facts["habit"], facts["object"]
    fear, hope, hook = facts["fear"], facts["hope"], facts["hook"]
    tie = facts.get("tie", "").strip()
    variant = sum(ord(c) for c in name) % 3
    if variant == 0:
        opener = (
            f"Ask around town for a {occupation.lower()} and someone will point you to {first} at {place}. "
            f"At {age}, this {species} has learned which smiles are currency and which are warnings."
        )
    elif variant == 1:
        opener = (
            f"{name} works as a {occupation.lower()} out of {place}, a {age}-year-old {species} "
            f"with more town memory than most council minutes."
        )
    else:
        opener = (
            f"Most days begin the same for {name}: a {age}-year-old {species} {occupation.lower()} "
            f"moving through {place} as if the stones themselves keep appointments with them."
        )
    middle = (
        f" {first} {habit}, and keeps {obj} close."
        f"{' ' + tie if tie else ''} "
        f"What drives them is simple to name and hard to finish: they want to {hope}. "
        f"What keeps them careful is {fear}."
    )
    closer = (
        f" To a DM, {first} is ready to roleplay immediately—useful for favors, local color, or trouble. "
        f"{hook}"
    )
    bio = re.sub(r"\s+", " ", (opener + middle + closer).strip())
    if wc(bio) < 75:
        bio += " They notice when a familiar street goes quiet, and they will trade help for coin, shelter, or protection when the town starts showing its teeth."
        bio = re.sub(r"\s+", " ", bio).strip()
    if wc(bio) > 150:
        bio = re.sub(r" To a DM, .+? or trouble\.", " Ready for immediate roleplay.", bio, count=1)
        bio = re.sub(r"\s+", " ", bio).strip()
    return bio


def build() -> None:
    roster = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    facts_all = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
    assert len(roster) == 100

    by_cat = {c: [] for c in CATEGORIES}
    for n in roster:
        facts = facts_all[n["id"]]
        archetype = OCC_ARCH.get(n["occupation"], "civilian")
        npc = {
            "id": n["id"],
            "name": n["name"],
            "species": n["species"],
            "gender": n["gender"],
            "age": n["age"],
            "occupation": n["occupation"],
            "category": n["category"],
            "tags": n["tags"],
            "description": f'{n["occupation"]} associated with {facts["place"]}.',
            "biography": compose_biography(n, facts),
            "personality": f'{facts["habit"].rstrip(".")}. Professional demeanor of a seasoned {n["occupation"].lower()}.',
            "motivation": f'Pursue this: {facts["hope"]}. Avoid this: {facts["fear"]}.',
            "secret": f'Privately terrified of {facts["fear"]}, and currently entangled with: {facts["hook"]}',
            "rumor": f'Rumor says {n["name"].split()[0]} can tell you anything that happens near {facts["place"]}—for a price or a kindness.',
            "voice": f'Speaks like a {n["species"]} {n["occupation"].lower()}: concrete details first, embellishment only when useful.',
            "appearance": f'{n["species"]}; often near {facts["place"]}; look for {facts["object"]}.',
            "portrait": f'modules/townforge/assets/portraits/{n["id"]}.webp',
            "token": f'modules/townforge/assets/tokens/{n["id"]}.webp',
            "relationships": n.get("relationships") or [],
            "actorData": n.get("actorData") or build_actor_data(archetype, n["species"]),
        }
        # Ensure actorData type
        if "type" not in npc["actorData"]:
            npc["actorData"]["type"] = "npc"
        w = wc(npc["biography"])
        if not (75 <= w <= 150):
            raise SystemExit(f'{npc["id"]} bio words={w}')
        by_cat[npc["category"]].append(npc)

    OUT.mkdir(parents=True, exist_ok=True)
    for category, npcs in by_cat.items():
        (OUT / f"{category}.json").write_text(
            json.dumps({"category": category, "npcs": npcs}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {category}.json ({len(npcs)})")
    manifest = {"library": "free", "version": 2, "packs": [f"{c}.json" for c in CATEGORIES]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Wrote manifest.json")
    print("Total", sum(len(v) for v in by_cat.values()))


if __name__ == "__main__":
    build()
