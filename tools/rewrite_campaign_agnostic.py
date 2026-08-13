#!/usr/bin/env python3
"""
Rewrite TownForge NPC facts + rebuild packs as campaign-agnostic content.

Preserves: names, species, occupations, categories, stats/actorData, relationships ids.
Rewrites: place/habit/object/fear/hope/hook/tie narrative where world-canon leaks in.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = Path(__file__).resolve().parent
FACTS_PATH = TOOLS / "npc_facts.json"
ROSTER_PATH = TOOLS / "roster_snapshot.json"

# Generic "workplace" phrases used inside narrative prose.
OCC_PLACE = {
    "Tavern Keeper": "a busy local tavern",
    "Cellar Master": "the tavern cellar",
    "Barmaid": "the tavern floor",
    "Bouncer": "the tavern doorway",
    "Fireplace Regular": "a fireside bench in the tavern",
    "Wine Seller": "a wine corner in the local tavern",
    "Taproom Cook": "the tavern kitchen",
    "Evening Singer": "a small stage in the local tavern",
    "Dice Dealer": "a corner dice table",
    "General Store Owner": "a general store",
    "Shop Clerk": "the general store counter",
    "Moneylender": "a cramped credit office",
    "Clothier": "a clothier's shop",
    "Spice Merchant": "a spice stall in the market",
    "Bookstore Owner": "a quiet bookstore",
    "Grain Dealer": "a grain yard",
    "Haberdasher": "a notions shop",
    "Chandler": "a chandler's workshop",
    "Apothecary Clerk": "an apothecary shopfront",
    "Pawnbroker": "a pawn shop",
    "City Guard Captain": "the watch barracks",
    "Junior Guard": "a town gate rotation",
    "Gate Sergeant": "the town gate",
    "Wall Archer": "the wall walk",
    "Watch Investigator": "quiet inns and alley corners",
    "Riot Shield Guard": "crowded market patrols",
    "Night Patrol Lead": "lamplit night beats",
    "Armory Warden": "the armory cage",
    "Undercover Watcher": "crowded markets in borrowed faces",
    "Drill Instructor": "the drill yard",
    "Noble Patron": "an upper-district receiving hall",
    "Estate Hostess": "a noble estate's guest rooms",
    "Knight Retainer": "a noble household's side hall",
    "Court Gossip": "fashionable parlors",
    "Mining Magnate": "a counting room above the market",
    "Lady-in-Waiting": "side corridors of a noble house",
    "Heir Apparent": "tutoring rooms and estate gardens",
    "Salon Patron": "an evening salon",
    "Street Sweep": "market lanes at dawn",
    "Carter": "warehouse yards and wagon rows",
    "Laundry Worker": "wash lines behind town houses",
    "Messenger Boy": "doorsteps across town",
    "Well Keeper": "the public well",
    "Stable Hand": "a busy stable yard",
    "Chimney Sweep": "rooftops and chimney stacks",
    "Street Peddler": "a market corner",
    "Dock Hauler": "the docks",
    "Seamstress": "a sewing room above a shop",
    "Baker's Assistant": "a bakery kitchen",
    "Herb Gatherer": "roadside hedges and garden edges",
    "Temple Priestess": "a local temple",
    "Temple Archivist": "a temple archive room",
    "Alms Keeper": "a temple alms porch",
    "Funeral Priest": "a quiet funeral chapel",
    "Acolyte": "temple aisles before dawn",
    "Oracle": "a curtained reading chamber",
    "Cloister Monk": "a cloister garden",
    "Guard Chaplain": "a small chapel near the barracks",
    "Fence": "a respectable-looking back-room shop",
    "Pickpocket": "crowded market aisles",
    "Lookout": "rooftops above the alleys",
    "Smuggler": "river barges and warehouse doors",
    "Forgery Clerk": "a desk piled with blank forms",
    "Information Broker": "shadowed booths and tea rooms",
    "Debt Collector": "doorways after dark",
    "Sewer Runner": "storm drains and undercroft tunnels",
    "Town Mage": "a tower workroom",
    "Public Scribe": "a writing desk in the square",
    "Library Archivist": "a town library stack",
    "Alchemist": "an alchemy bench",
    "Children's Tutor": "a tutoring room",
    "Cartographer": "a map table littered with chalk",
    "Town Historian": "a records loft",
    "Caravan Master": "a caravan yard",
    "Wilderness Scout": "trailheads outside town",
    "Traveling Minstrel": "inn common rooms along the road",
    "Pilgrim": "roadside shrines",
    "River Sailor": "river landings and flatboats",
    "Game Hunter": "woodland trails near town",
    "Long-Road Courier": "waystations and courier posts",
    "Blacksmith": "a smithy",
    "Cooper": "a cooperage",
    "Potter": "a pottery shed",
    "Carpenter": "a timber yard",
    "Cobbler": "a cobbler's bench",
    "Fletcher": "a fletcher's loft",
    "Baker": "a bakery at first light",
    "Tinker": "a tinker's cart and workbench",
    "Weaver": "a weaving room",
    "Stonemason": "a stone yard",
    "Town Mayor": "the mayor's office",
    "Town Clerk": "a records desk",
    "Bailiff": "the magistrate's outer office",
    "Tax Assessor": "ledgers and warehouse doors",
    "Magistrate": "a modest courtroom",
    "Town Herald": "the public square",
    "Midwife": "homes across town",
    "Gravedigger": "the graveyard",
    "Ratcatcher": "cellars and undercroft runs",
    "Matchmaker": "parlors and tea shops",
}

# Phrase replacements that strip invented world canon / IP.
REPLACEMENTS = [
    (r"\bthe Hearth\s*&\s*Barrel\b", "the local tavern"),
    (r"\bHearth\s*&\s*Barrel\b", "the local tavern"),
    (r"\bBrassbarrow General\b", "the general store"),
    (r"\bHedda's Fine Cloth\b", "the clothier's shop"),
    (r"\bFine Cloth\b", "clothier's shop"),
    (r"\bthe Quiet Quire bookstore\b", "a quiet bookstore"),
    (r"\bQuiet Quire\b", "the bookstore"),
    (r"\bIronbloom Forge\b", "the smithy"),
    (r"\bOvenheart Bakery\b", "the bakery"),
    (r"\bVale Manor\b", "the noble estate"),
    (r"\bTemple of Kindled Mercy\b", "a local temple"),
    (r"\bKindled Mercy\b", "the local temple"),
    (r"\bKhuzdul\b", "Dwarvish"),
    (r"\bMidsummer fair\b", "the summer fair"),
    (r"\bMidsummer\b", "midsummer"),
    (r"\bMidwinter\b", "midwinter"),
    (r"\bWinterfest\b", "the winter festival"),
    (r"\bautumn fair\b", "the harvest fair"),
    (r"\bsouth gate\b", "the town gate"),
    (r"\briver gate\b", "the town gate"),
    (r"\beastern wall walk\b", "the wall walk"),
    (r"\bgrain street\b", "the market street"),
    (r"\bmarket square\b", "the market"),
    (r"\bthe council\b", "local officials"),
    (r"\bcouncil politics\b", "town politics"),
    (r"\bcouncil\b", "local officials"),
    (r"\bupriver\b", "along the trade road"),
    (r"\bNorth Gate\b", "the town gate"),
    (r"\bold mill\b", "an abandoned mill"),
    (r"\briver-town\b", "local"),
    (r"\briver rights\b", "docking privileges"),
]


def scrub(text: str) -> str:
    out = text or ""
    for pattern, repl in REPLACEMENTS:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)
    return out


def rewrite_facts() -> dict:
    roster = json.loads(ROSTER_PATH.read_text(encoding="utf-8"))
    facts = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
    by_id = {n["id"]: n for n in roster}

    rewritten = 0
    for npc_id, fact in facts.items():
        npc = by_id[npc_id]
        before = json.dumps(fact, sort_keys=True)
        occupation = npc["occupation"]
        fact["place"] = OCC_PLACE.get(occupation, "around town")
        for key in ("habit", "object", "fear", "hope", "hook", "tie"):
            if key in fact and isinstance(fact[key], str):
                fact[key] = scrub(fact[key])
        # Soften hooks that still read like hard canon.
        fact["hook"] = soften_hook(fact.get("hook", ""), npc)
        fact["fear"] = soften_goalish(fact.get("fear", ""))
        fact["hope"] = soften_goalish(fact.get("hope", ""))
        after = json.dumps(fact, sort_keys=True)
        if before != after:
            rewritten += 1

    FACTS_PATH.write_text(json.dumps(facts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Rewrote facts for {rewritten}/{len(facts)} NPCs → {FACTS_PATH}")
    return facts


def soften_hook(hook: str, npc: dict) -> str:
    text = scrub(hook)
    text = re.sub(r"\bElen's temple\b", "the local temple", text, flags=re.I)
    if text and not text.endswith((".", "!", "?")):
        text += "."
    return text


def soften_goalish(text: str) -> str:
    text = scrub(text)
    text = re.sub(r"\bthe town is kinder than it is\b", "people are kinder than they are", text, flags=re.I)
    return text


if __name__ == "__main__":
    rewrite_facts()
