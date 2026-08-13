#!/usr/bin/env python3
"""Build TownForge v0.2 free launch library NPC packs (100 NPCs)."""

from __future__ import annotations

import json
import re
from pathlib import Path

from actor_builders import build_actor_data

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "npcs"
LEGACY = ROOT / "data" / "npcs.json"
ROSTER_PATH = Path(__file__).resolve().parent / "roster_snapshot.json"
FACTS_PATH = Path(__file__).resolve().parent / "npc_facts.json"

CATEGORIES = [
    "tavern",
    "shops",
    "guards",
    "nobility",
    "commoners",
    "religious",
    "criminal",
    "scholars",
    "travelers",
    "craftsmen",
    "government",
    "miscellaneous",
]

OCC_ARCH = {
    "Tavern Keeper": "innkeeper",
    "Cellar Master": "innkeeper",
    "Barmaid": "civilian",
    "Bouncer": "guard",
    "Fireplace Regular": "civilian",
    "Wine Seller": "merchant",
    "Taproom Cook": "craftsman",
    "Evening Singer": "civilian",
    "Dice Dealer": "criminal",
    "General Store Owner": "merchant",
    "Shop Clerk": "merchant",
    "Moneylender": "merchant",
    "Clothier": "merchant",
    "Spice Merchant": "merchant",
    "Bookstore Owner": "scholar",
    "Grain Dealer": "merchant",
    "Haberdasher": "merchant",
    "Chandler": "craftsman",
    "Apothecary Clerk": "scholar",
    "Pawnbroker": "merchant",
    "City Guard Captain": "guard_captain",
    "Junior Guard": "guard",
    "Gate Sergeant": "guard",
    "Wall Archer": "guard",
    "Watch Investigator": "guard",
    "Riot Shield Guard": "guard",
    "Night Patrol Lead": "guard",
    "Armory Warden": "guard",
    "Undercover Watcher": "criminal",
    "Drill Instructor": "guard",
    "Noble Patron": "noble",
    "Estate Hostess": "noble",
    "Knight Retainer": "guard_captain",
    "Court Gossip": "noble",
    "Mining Magnate": "noble",
    "Lady-in-Waiting": "civilian",
    "Heir Apparent": "civilian",
    "Salon Patron": "noble",
    "Street Sweep": "civilian",
    "Carter": "civilian",
    "Laundry Worker": "civilian",
    "Messenger Boy": "traveler",
    "Well Keeper": "civilian",
    "Stable Hand": "civilian",
    "Chimney Sweep": "civilian",
    "Street Peddler": "merchant",
    "Dock Hauler": "civilian",
    "Seamstress": "craftsman",
    "Baker's Assistant": "civilian",
    "Herb Gatherer": "traveler",
    "Temple Priestess": "priest",
    "Temple Archivist": "scholar",
    "Alms Keeper": "priest",
    "Funeral Priest": "priest",
    "Acolyte": "civilian",
    "Oracle": "mage",
    "Cloister Monk": "priest",
    "Guard Chaplain": "priest",
    "Fence": "criminal",
    "Pickpocket": "criminal",
    "Lookout": "criminal",
    "Smuggler": "criminal",
    "Forgery Clerk": "scholar",
    "Information Broker": "criminal",
    "Debt Collector": "criminal",
    "Sewer Runner": "criminal",
    "Town Mage": "mage",
    "Public Scribe": "scholar",
    "Library Archivist": "scholar",
    "Alchemist": "scholar",
    "Children's Tutor": "scholar",
    "Cartographer": "scholar",
    "Town Historian": "scholar",
    "Caravan Master": "traveler",
    "Wilderness Scout": "traveler",
    "Traveling Minstrel": "civilian",
    "Pilgrim": "priest",
    "River Sailor": "traveler",
    "Game Hunter": "traveler",
    "Long-Road Courier": "traveler",
    "Blacksmith": "blacksmith",
    "Cooper": "craftsman",
    "Potter": "craftsman",
    "Carpenter": "craftsman",
    "Cobbler": "craftsman",
    "Fletcher": "craftsman",
    "Baker": "civilian",
    "Tinker": "craftsman",
    "Weaver": "craftsman",
    "Stonemason": "craftsman",
    "Town Mayor": "official",
    "Town Clerk": "official",
    "Bailiff": "official",
    "Tax Assessor": "official",
    "Magistrate": "official",
    "Town Herald": "civilian",
    "Midwife": "civilian",
    "Gravedigger": "civilian",
    "Ratcatcher": "criminal",
    "Matchmaker": "civilian",
}


def wc(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def pronouns(gender: str) -> dict[str, str]:
    g = (gender or "").strip().lower()
    if g.startswith("f"):
        return {"subj": "she", "obj": "her", "poss": "her", "Poss": "Her", "Subj": "She", "refl": "herself"}
    if g.startswith("m"):
        return {"subj": "he", "obj": "him", "poss": "his", "Poss": "His", "Subj": "He", "refl": "himself"}
    return {"subj": "they", "obj": "them", "poss": "their", "Poss": "Their", "Subj": "They", "refl": "themselves"}


def seed(s: str) -> int:
    return sum((i + 1) * ord(c) for i, c in enumerate(s))


def article(noun: str) -> str:
    text = (noun or "").strip()
    if not text:
        return text
    if re.match(r"^(a|an|the)\b", text, flags=re.I):
        return text
    return f"the {text}"


def compose_biography(n: dict, facts: dict) -> str:
    p = pronouns(n["gender"])
    first = n["name"].split()[0]
    # Prefer given name over titles like Mother/Lord/Sir.
    parts_name = n["name"].split()
    if parts_name[0] in {"Mother", "Father", "Brother", "Sister", "Lord", "Lady", "Sir", "Dame", "Mayor", "Judge", "Bailiff", "Chaplain", "Magister"} and len(parts_name) > 1:
        first = parts_name[1]
    age, species, occupation = n["age"], n["species"], n["occupation"].lower()
    place, habit, obj = facts["place"], facts["habit"], article(facts["object"])
    fear, hope, hook, tie = facts["fear"], facts["hope"], facts["hook"], facts.get("tie", "").strip()
    v = seed(n["id"]) % 8

    if v == 0:
        parts = [
            f"{n['name']} works from {place} with the stubborn patience of a {age}-year-old {species} who has already survived harder seasons.",
            f"{p['Subj']} {habit}, and keeps {obj} close when tempers rise.",
            (tie if tie.endswith(".") else f"{tie}.") if tie else "",
            f"{p['Poss'].capitalize()} private aim is simple: {hope}.",
            f"Still, {p['subj']} flinches at the thought of {fear}.",
            f"Lately a fresh problem has landed in {p['poss']} lap: {hook}",
        ]
    elif v == 1:
        parts = [
            f"People looking for a reliable {occupation} are often sent to {first}, who claims {place} as familiar ground.",
            f"At {age}, this {species} has learned to watch hands before faces.",
            f"{p['Subj']} {habit}; neighbors joke that {p['subj']} would miss a festival before misplacing {obj}.",
            f"{tie}." if tie and not tie.endswith(".") else tie,
            f"{p['Subj']} is saving courage and coin alike to {hope}, while trying not to let {fear} decide the ending.",
            hook,
        ]
    elif v == 2:
        parts = [
            f"Before dawn, {first} is already at {place}, working as a {occupation} with yesterday's work still on {p['poss']} fingers.",
            f"The habit everyone notices is simple: {p['subj']} {habit}.",
            f"Close by sits {p['poss']} prized {obj}, a small anchor in a loud settlement.",
            f"{tie}." if tie and not tie.endswith(".") else (tie or f"Locals treat {p['obj']} as a fixture more than a stranger."),
            f"{p['Subj']} wants to {hope}. {p['Subj']} fears {fear} more than open confrontation.",
            f"A useful adventure hook trails {p['obj']}: {hook}",
        ]
    elif v == 3:
        parts = [
            f"{first} did not plan to become the neighborhood's go-to {occupation}, yet {place} made the choice stick.",
            f"Now {age}, the {species} measures success in quiet evenings and unpaid favors returned.",
            f"{p['Subj'].capitalize()} {habit}, and keeps {obj} the way a confessor keeps secrets.",
            f"{tie}." if tie and not tie.endswith(".") else tie,
            f"Hope pulls one way—{hope}—while caution pulls the other because of {fear}.",
            hook,
        ]
    elif v == 4:
        parts = [
            f"Walk into {place} and you will find {n['name']} before you find a free chair.",
            f"A {age}-year-old {species} {occupation}, {first} greets trouble the way other folk greet weather: with a coat and a plan.",
            f"{p['Subj'].capitalize()} {habit}. The {obj} travels with {p['obj']} almost everywhere.",
            f"{tie}." if tie and not tie.endswith(".") else (tie or f"Relationships around {p['obj']} are practical, not ornamental."),
            f"{p['Poss'].capitalize()} ambition is to {hope}. {p['Poss'].capitalize()} nightmare is {fear}.",
            f"Right now, {hook}",
        ]
    elif v == 5:
        parts = [
            f"{n['name']}'s reputation as a {occupation} was built one careful errand at a time around {place}.",
            f"Age {age} sits lightly on this {species}, except when old debts creak.",
            f"Watch long enough and you will see that {p['subj']} {habit}.",
            f"The {obj} is part tool, part talisman.",
            f"{tie}." if tie and not tie.endswith(".") else tie,
            f"{p['Subj'].capitalize()} would trade sleep to {hope}, yet stays wary of {fear}. Current spark: {hook}",
        ]
    elif v == 6:
        parts = [
            f"Some locals swear {first} was born mid-shift at {place}; the truth is only slightly less devoted.",
            f"This {species.lower()} {occupation}, now {age}, treats competence like courtesy.",
            f"{p['Subj'].capitalize()} {habit}, never far from {obj}.",
            f"{tie}." if tie and not tie.endswith(".") else (tie or f"{p['Subj'].capitalize()} knows which doors open after dark and which only pretend to."),
            f"Ask what {p['subj']} wants and {p['subj']} names it plainly: {hope}.",
            f"Ask what {p['subj']} dreads and the answer is {fear}. Then comes the fresh problem—{hook}",
        ]
    else:
        parts = [
            f"{first} learned the hard corners of settlement life by working them as a {occupation} based out of {place}.",
            f"At {age}, the {species} has a map of loyalties written in calluses rather than ink.",
            f"Day after day {p['subj']} {habit}, and {obj} marks {p['poss']} place in the room.",
            f"{tie}." if tie and not tie.endswith(".") else tie,
            f"{p['Poss'].capitalize()} north star is to {hope}. The shadow at {p['poss']} heels is {fear}.",
            hook,
        ]

    bio = " ".join(part.strip() for part in parts if part and part.strip())
    bio = re.sub(r"\s+", " ", bio).strip()
    bio = re.sub(r"\.\.+", ".", bio)
    bio = re.sub(r"\s+\.", ".", bio)
    bio = re.sub(r"\bThe the\b", "The", bio)
    bio = re.sub(r"\bthe the\b", "the", bio)

    if wc(bio) < 75:
        bio += (
            f" When pressed, {first} will trade a favor for a favor, provided nobody asks {p['obj']} "
            f"to pretend every stranger means well."
        )
        bio = re.sub(r"\s+", " ", bio).strip()
    while wc(bio) > 125:
        sentences = re.split(r"(?<=[.!?])\s+", bio)
        if len(sentences) <= 3:
            words = bio.split()
            bio = " ".join(words[:125])
            break
        drop_idx = 1 + (seed(n["id"]) % (len(sentences) - 2))
        sentences.pop(drop_idx)
        bio = " ".join(sentences).strip()
    return bio


def compose_fields(n: dict, facts: dict) -> dict[str, str]:
    p = pronouns(n["gender"])
    parts_name = n["name"].split()
    first = parts_name[0]
    if first in {"Mother", "Father", "Brother", "Sister", "Lord", "Lady", "Sir", "Dame", "Mayor", "Judge", "Bailiff", "Chaplain", "Magister"} and len(parts_name) > 1:
        first = parts_name[1]
    v = seed(n["id"] + "fields") % 5
    habit, place, obj = facts["habit"], facts["place"], article(facts["object"])
    fear, hope, hook = facts["fear"], facts["hope"], facts["hook"]

    personalities = [
        f"Steady and sharp-eyed; {habit}.",
        f"Warm with regulars, curt with wasters; {habit}.",
        f"Dry humor over a careful heart; {habit}.",
        f"Proud of competence more than praise; {habit}.",
        f"Soft-spoken until principles are poked; {habit}.",
    ]
    motivations = [
        f"To {hope}, even while fearing {fear}.",
        f"Secure enough ground to {hope}.",
        f"Finish one honest plan: {hope}.",
        f"Protect {p['poss']} livelihood long enough to {hope}.",
        f"Turn today's scrapes into tomorrow's chance to {hope}.",
    ]
    secrets = [
        f"Knows more about this than {p['subj']} admits: {hook}",
        f"Quietly arranging matters around this problem: {hook}",
        f"Keeps proof related to a problem—{hook}",
        f"Has not told allies the truth: {hook}",
        f"Night thoughts keep returning to {fear}, especially since: {hook}",
    ]
    rumors = [
        f"Customers claim {first} knows which doors open after hours—if asked the right way.",
        f"Someone paid {first} to forget a name connected to recent trouble near {place}.",
        f"Locals whisper that {obj} once belonged to a traveler who vanished on the road.",
        f"{first} is said to keep a private list of debts local officials will not touch.",
        f"A smugglers' mark was seen near {place} on a night {first} worked late.",
    ]
    voices = [
        f"Measured {n['species'].lower()} cadence; concrete nouns before adjectives.",
        f"Quick local diction, then sudden silences that mean more than words.",
        f"Low and practical, with a habit of repeating the important clause once.",
        f"Polite public voice; sharper private asides when trust appears.",
        f"Storyteller rhythm even when discussing ledgers or latches.",
    ]
    appearances = [
        f"{n['species']} features shaped by work at {place}; watch for {obj}.",
        f"Work-worn {n['species'].lower()} garb; {obj} always nearby.",
        f"Easy to spot near {place}: {n['species'].lower()}, practical layers, and {obj}.",
        f"A {n['species'].lower()} silhouette framed by {place}, hands seldom empty of {obj}.",
        f"Looks like someone who sleeps lightly; distinctive detail is {obj}.",
    ]
    descriptions = [
        f"A {n['occupation'].lower()} rooted at {place}, known for how {p['subj']} {habit}.",
        f"{first} holds down {place} with callused competence and open ears.",
        f"Local {n['occupation'].lower()} whose days orbit {place} and small lasting loyalties.",
        f"Familiar face at {place}; useful, stubborn, and hard to surprise.",
        f"The {n['occupation'].lower()} people recommend when they actually want the job finished.",
    ]

    return {
        "description": descriptions[v],
        "personality": personalities[v],
        "motivation": motivations[v],
        "secret": secrets[v],
        "rumor": rumors[(v + seed(n["id"])) % 5],
        "voice": voices[(v + 2) % 5],
        "appearance": appearances[(v + 3) % 5],
    }


def build() -> None:
    roster = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    facts_all = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
    if len(roster) != 100:
        raise SystemExit(f"Expected 100 roster entries, got {len(roster)}")

    by_cat: dict[str, list[dict]] = {c: [] for c in CATEGORIES}
    for n in roster:
        npc_id = n["id"]
        if npc_id not in facts_all:
            raise SystemExit(f"Missing facts for {npc_id}")
        facts = facts_all[npc_id]
        fields = compose_fields(n, facts)
        archetype = OCC_ARCH.get(n["occupation"], "civilian")
        biography = compose_biography(n, facts)
        words = wc(biography)
        if not (75 <= words <= 125):
            raise SystemExit(f"{npc_id}: biography has {words} words")

        npc = {
            "id": npc_id,
            "name": n["name"],
            "species": n["species"],
            "gender": n["gender"],
            "age": n["age"],
            "occupation": n["occupation"],
            "category": n["category"],
            "tags": n["tags"],
            "description": fields["description"],
            "biography": biography,
            "personality": fields["personality"],
            "motivation": fields["motivation"],
            "secret": fields["secret"],
            "rumor": fields["rumor"],
            "voice": fields["voice"],
            "appearance": fields["appearance"],
            "portrait": f"modules/townforge/assets/portraits/{npc_id}.webp",
            "token": f"modules/townforge/assets/tokens/{npc_id}.webp",
            "actorData": build_actor_data(archetype, n["species"]),
        }
        if n.get("relationships"):
            npc["relationships"] = n["relationships"]
        by_cat[n["category"]].append(npc)

    if LEGACY.exists():
        LEGACY.unlink()
        print(f"Deleted legacy {LEGACY}")

    OUT.mkdir(parents=True, exist_ok=True)
    for category in CATEGORIES:
        npcs = by_cat[category]
        path = OUT / f"{category}.json"
        path.write_text(
            json.dumps({"category": category, "npcs": npcs}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {path.name} ({len(npcs)})")

    manifest = {"library": "free", "version": 2, "packs": [f"{c}.json" for c in CATEGORIES]}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Wrote manifest.json")
    print("Total", sum(len(v) for v in by_cat.values()))


if __name__ == "__main__":
    build()
