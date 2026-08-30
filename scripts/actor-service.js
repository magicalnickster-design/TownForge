import {
  resolveClassItemStub,
  resolveCompendiumDocument
} from "./compendium-resolver.js";
import { buildNpcCombatStatUpdates } from "./npc-combat-stats.js";
import { FLAGS, LOG_PREFIX, MODULE_ID, MODULE_TITLE } from "./constants.js";

const FALLBACK_IMAGE = "icons/svg/mystery-man.svg";

/**
 * Foundry Actor / Token helpers for TownForge NPCs.
 */
export class ActorService {
  /** @type {Set<string>} */
  #creatingNpcIds = new Set();

  /**
   * Create/reuse the Actor in the Actors directory without placing a token.
   * @param {object} npc
   * @returns {Promise<{actor: Actor|null, createdActor: boolean}>}
   */
  async importActor(npc) {
    if (!npc?.id) {
      console.error(`${LOG_PREFIX} Import Actor aborted — NPC is missing an id`);
      ui.notifications?.error("TownForge cannot import an NPC without a stable id.");
      return { actor: null, createdActor: false };
    }

    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can import TownForge NPCs.");
      return { actor: null, createdActor: false };
    }

    try {
      const { actor, created } = await this.ensureActor(npc);
      if (created) {
        ui.notifications?.info(`TownForge imported ${npc.name} into the Actors directory.`);
      }
      return { actor, createdActor: created };
    } catch (error) {
      console.error(`${LOG_PREFIX} Actor import failed for "${npc.id}"`, error);
      ui.notifications?.error(`TownForge could not import ${npc.name}.`);
      return { actor: null, createdActor: false };
    }
  }

  /**
   * Ensure an Actor exists for the given TownForge NPC, then place a token.
   * @param {object} npc Normalized TownForge NPC record
   * @returns {Promise<{actor: Actor|null, token: TokenDocument|null, createdActor: boolean}>}
   */
  async addNpcToScene(npc) {
    if (!npc?.id) {
      console.error(`${LOG_PREFIX} Add to Scene aborted — NPC is missing an id`);
      ui.notifications?.error("TownForge cannot add an NPC without a stable id.");
      return { actor: null, token: null, createdActor: false };
    }

    if (!canvas?.ready || !canvas.scene) {
      console.warn(`${LOG_PREFIX} Add to Scene aborted — no active scene`);
      ui.notifications?.warn("TownForge needs an active scene to place a token.");
      return { actor: null, token: null, createdActor: false };
    }

    if (!game.user?.isGM) {
      console.warn(`${LOG_PREFIX} Add to Scene aborted — user is not a GM`);
      ui.notifications?.warn("Only the GM can add TownForge NPCs to the scene.");
      return { actor: null, token: null, createdActor: false };
    }

    let actor;
    let createdActor = false;

    try {
      ({ actor, created: createdActor } = await this.ensureActor(npc));
    } catch (error) {
      console.error(`${LOG_PREFIX} Actor creation failed for "${npc.id}"`, error);
      ui.notifications?.error(`TownForge could not create an Actor for ${npc.name}.`);
      return { actor: null, token: null, createdActor: false };
    }

    let token = null;
    try {
      token = await this.placeTokenNearViewport(actor, npc);
      console.log(
        `${LOG_PREFIX} Token created for "${npc.name}" (${token?.id ?? "unknown"}) on scene ${canvas.scene.id}`
      );
    } catch (error) {
      console.error(`${LOG_PREFIX} Token creation failed for "${npc.id}"`, error);
      ui.notifications?.error(`TownForge could not place a token for ${npc.name}.`);
      return { actor, token: null, createdActor };
    }

    return { actor, token, createdActor };
  }

  /**
   * Find or create the world Actor for a TownForge NPC.
   * Duplicate prevention is based on flags.townforge.npcId.
   * @param {object} npc
   * @returns {Promise<{actor: Actor, created: boolean}>}
   */
  async ensureActor(npc) {
    const existing = this.findActorByNpcId(npc.id);
    if (existing) {
      await this.#syncActorLoadoutIfNeeded(existing, npc);
      console.log(`${LOG_PREFIX} Actor reused for "${npc.name}" (${existing.id})`);
      return { actor: existing, created: false };
    }

    if (this.#creatingNpcIds.has(npc.id)) {
      // Rare double-click race: wait briefly and re-check.
      await this.#waitForSiblingCreate(npc.id);
      const raced = this.findActorByNpcId(npc.id);
      if (raced) {
        await this.#syncActorLoadoutIfNeeded(raced, npc);
        console.log(`${LOG_PREFIX} Actor reused for "${npc.name}" (${raced.id})`);
        return { actor: raced, created: false };
      }
    }

    this.#creatingNpcIds.add(npc.id);
    try {
      // Re-check after acquiring the in-flight lock.
      const again = this.findActorByNpcId(npc.id);
      if (again) {
        await this.#syncActorLoadoutIfNeeded(again, npc);
        console.log(`${LOG_PREFIX} Actor reused for "${npc.name}" (${again.id})`);
        return { actor: again, created: false };
      }

      const actorData = await this.#buildActorData(npc);
      const itemData = actorData.items ?? [];
      delete actorData.items;

      const createdActors = await Actor.implementation.create(actorData);
      const actor = Array.isArray(createdActors) ? createdActors[0] : createdActors;

      if (!actor) {
        throw new Error(`Actor.implementation.create returned no document for "${npc.id}"`);
      }

      if (itemData.length) {
        await actor.createEmbeddedDocuments("Item", itemData);
      }
      await this.#applyNpcCombatStats(actor, npc);
      await this.#markLoadoutVersion(actor, npc);

      console.log(`${LOG_PREFIX} Actor created for "${npc.name}" (${actor.id})`);
      return { actor, created: true };
    } finally {
      this.#creatingNpcIds.delete(npc.id);
    }
  }

  /**
   * Locate a previously created TownForge Actor by NPC id.
   * @param {string} npcId
   * @returns {Actor|null}
   */
  findActorByNpcId(npcId) {
    return (
      game.actors?.find((actor) => actor.getFlag(MODULE_ID, FLAGS.NPC_ID) === npcId) ?? null
    );
  }

  /**
   * Create a token for the Actor near the center of the current viewport.
   * @param {Actor} actor
   * @param {object} npc
   * @returns {Promise<TokenDocument>}
   */
  async placeTokenNearViewport(actor, npc) {
    const position = this.#getViewportCenterPosition(actor);
    const tokenSrc = await this.#resolveImagePath(
      npc.token || actor.prototypeToken?.texture?.src || actor.img,
      FALLBACK_IMAGE
    );

    const tokenSource = await actor.getTokenDocument(
      {
        x: position.x,
        y: position.y,
        actorLink: true,
        texture: {
          src: tokenSrc
        }
      },
      { parent: canvas.scene }
    );

    const created = await canvas.scene.createEmbeddedDocuments("Token", [
      tokenSource.toObject()
    ]);
    const token = Array.isArray(created) ? created[0] : created;

    if (!token) {
      throw new Error(`Token creation returned no document for Actor ${actor.id}`);
    }

    return token;
  }

  /**
   * Build Actor create data from a TownForge NPC definition.
   * @param {object} npc
   * @returns {Promise<object>}
   */
  async #buildActorData(npc) {
    const base =
      npc.actorData && typeof npc.actorData === "object"
        ? foundry.utils.deepClone(npc.actorData)
        : {};

    // Asset probes happen only during Add to Scene (never while browsing).
    const portrait = await this.#resolveImagePath(npc.portrait, FALLBACK_IMAGE);
    const tokenImg = await this.#resolveImagePath(npc.token || npc.portrait, portrait);
    const biographyHtml = this.#buildBiographyHtml(npc);

    const data = foundry.utils.mergeObject(
      base,
      {
        name: npc.name,
        type: this.#resolveActorType(base.type),
        img: portrait,
        prototypeToken: {
          name: npc.name,
          texture: { src: tokenImg },
          actorLink: true
        },
        system: {
          details: {
            biography: {
              value: biographyHtml
            }
          }
        },
        flags: {
          [MODULE_ID]: {
            [FLAGS.NPC_ID]: npc.id,
            [FLAGS.LIBRARY]: npc.library ?? "free",
            [FLAGS.SOURCE]: "townforge",
            [FLAGS.OCCUPATION]: npc.occupation ?? ""
          }
        }
      },
      { inplace: false }
    );

    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAGS.NPC_ID}`, npc.id);
    foundry.utils.setProperty(
      data,
      `flags.${MODULE_ID}.${FLAGS.LIBRARY}`,
      npc.library ?? "free"
    );
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAGS.SOURCE}`, "townforge");
    foundry.utils.setProperty(
      data,
      `flags.${MODULE_ID}.${FLAGS.OCCUPATION}`,
      npc.occupation ?? ""
    );

    data.items = await this.#resolveItemStubs(data.items ?? []);

    return data;
  }

  /**
   * @param {object} npc
   * @returns {string}
   */
  #expectedLoadoutVersion(npc) {
    const moduleVersion = game.modules.get(MODULE_ID)?.version ?? "0.8.2";
    const itemCount = Array.isArray(npc.actorData?.items) ? npc.actorData.items.length : 0;
    return `${moduleVersion}:${itemCount}`;
  }

  /**
   * @param {Actor} actor
   * @param {object} npc
   */
  async #markLoadoutVersion(actor, npc) {
    await actor.setFlag(MODULE_ID, FLAGS.LOADOUT_VERSION, this.#expectedLoadoutVersion(npc));
  }

  /**
   * Refresh combat gear on actors imported before loadout updates.
   * @param {Actor} actor
   * @param {object} npc
   */
  async #syncActorLoadoutIfNeeded(actor, npc) {
    const expected = this.#expectedLoadoutVersion(npc);
    const current = actor.getFlag(MODULE_ID, FLAGS.LOADOUT_VERSION);
    if (current === expected) return;

    const stubs = npc.actorData?.items ?? [];
    const items = await this.#resolveItemStubs(stubs);
    if (!items.length) {
      console.warn(`${LOG_PREFIX} No combat items resolved for "${npc.name}"; loadout sync skipped`);
      return;
    }

    const existingIds = actor.items?.map((item) => item.id) ?? [];
    if (existingIds.length) {
      await actor.deleteEmbeddedDocuments("Item", existingIds);
    }
    await actor.createEmbeddedDocuments("Item", items);

    await this.#applyNpcCombatStats(actor, npc);
    await this.#markLoadoutVersion(actor, npc);
    console.log(`${LOG_PREFIX} Synced combat loadout for "${npc.name}" (${items.length} items)`);
    try {
      ui.notifications?.info(`${MODULE_TITLE} updated combat gear for ${npc.name}.`);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Loadout sync notification failed for "${npc.name}"`, error);
    }
  }

  /**
   * Apply HP/AC/prof/level after class items exist (dnd5e may overwrite HP on embed).
   * @param {Actor} actor
   * @param {object} npc
   */
  async #applyNpcCombatStats(actor, npc) {
    const updates = buildNpcCombatStatUpdates(npc);
    if (Object.keys(updates).length) {
      await actor.update(updates);
    }
  }

  /**
   * Expand compendium UUID stubs into full dnd5e item data for Actor import.
   * @param {object[]} stubs
   * @returns {Promise<object[]>}
   */
  async #resolveItemStubs(stubs) {
    if (!Array.isArray(stubs) || !stubs.length) return [];

    const items = [];
    for (const stub of stubs) {
      if (!stub || typeof stub !== "object") continue;
      if (stub.compendium) {
        try {
          const documentName = stub.type === "spell" ? "Spell" : "Item";
          const doc = await resolveCompendiumDocument(stub.compendium, {
            documentName,
            name: stub.name
          });
          if (!doc) {
            console.warn(`${LOG_PREFIX} Compendium entry not found: ${stub.compendium}`);
            continue;
          }
          const itemData = doc.toObject ? doc.toObject() : foundry.utils.deepClone(doc);
          delete itemData._id;
          if (stub.equipped) foundry.utils.setProperty(itemData, "system.equipped", true);
          if (Number.isFinite(stub.quantity)) {
            foundry.utils.setProperty(itemData, "system.quantity", stub.quantity);
          }
          items.push(itemData);
        } catch (error) {
          console.warn(`${LOG_PREFIX} Failed to resolve compendium item ${stub.compendium}`, error);
        }
        continue;
      }
      if (stub.type === "class") {
        items.push(await resolveClassItemStub(stub));
        continue;
      }
      items.push(foundry.utils.deepClone(stub));
    }
    return items;
  }

  /**
   * Prefer dnd5e "npc" while remaining defensive if the system lacks that type.
   * @param {string|undefined} preferred
   * @returns {string}
   */
  #resolveActorType(preferred) {
    // Foundry v13 exposes valid Actor types via game.system.documentTypes.Actor
    const fromSystem = game.system?.documentTypes?.Actor;
    const fromLabels = Object.keys(CONFIG.Actor?.typeLabels ?? {});
    const validTypes = Array.isArray(fromSystem) && fromSystem.length
      ? fromSystem
      : fromLabels.length
        ? fromLabels
        : ["npc"];

    if (preferred && validTypes.includes(preferred)) return preferred;
    if (validTypes.includes("npc")) return "npc";
    return validTypes[0] ?? "npc";
  }

  /**
   * Approximate the current viewport center in scene coordinates, snap, and clamp.
   * @param {Actor} actor
   * @returns {{x: number, y: number}}
   */
  #getViewportCenterPosition(actor) {
    const tokenWidth = Math.max(Number(actor.prototypeToken?.width ?? 1), 0.5);
    const tokenHeight = Math.max(Number(actor.prototypeToken?.height ?? 1), 0.5);
    const gridSize = canvas.grid?.size ?? canvas.dimensions?.size ?? 100;

    let centerX;
    let centerY;

    if (typeof canvas.canvasCoordinatesFromClient === "function") {
      const view = canvas.canvasCoordinatesFromClient({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });
      centerX = view.x;
      centerY = view.y;
    } else {
      centerX = canvas.stage?.pivot?.x;
      centerY = canvas.stage?.pivot?.y;
    }

    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      const rect = canvas.dimensions?.sceneRect;
      centerX = rect ? rect.x + rect.width / 2 : (canvas.dimensions?.width ?? 0) / 2;
      centerY = rect ? rect.y + rect.height / 2 : (canvas.dimensions?.height ?? 0) / 2;
    }

    // TokenDocument x/y are the top-left of the token.
    let x = centerX - (tokenWidth * gridSize) / 2;
    let y = centerY - (tokenHeight * gridSize) / 2;

    const snapMode = CONST.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER;
    if (typeof canvas.grid?.getSnappedPoint === "function" && Number.isFinite(snapMode)) {
      const snapped = canvas.grid.getSnappedPoint({ x, y }, { mode: snapMode });
      x = snapped.x;
      y = snapped.y;
    }

    return this.#clampToScene(x, y, tokenWidth, tokenHeight, gridSize);
  }

  /**
   * Keep token top-left coordinates inside the playable scene rectangle.
   * @param {number} x
   * @param {number} y
   * @param {number} tokenWidth
   * @param {number} tokenHeight
   * @param {number} gridSize
   * @returns {{x: number, y: number}}
   */
  #clampToScene(x, y, tokenWidth, tokenHeight, gridSize) {
    const rect = canvas.dimensions?.sceneRect;
    if (!rect) return { x, y };

    const maxX = Math.max(rect.x, rect.x + rect.width - tokenWidth * gridSize);
    const maxY = Math.max(rect.y, rect.y + rect.height - tokenHeight * gridSize);

    return {
      x: Math.min(Math.max(x, rect.x), maxX),
      y: Math.min(Math.max(y, rect.y), maxY)
    };
  }

  /**
   * Resolve an image path, falling back when missing/unreachable.
   * @param {string|null|undefined} path
   * @param {string} fallback
   * @returns {Promise<string>}
   */
  async #resolveImagePath(path, fallback) {
    const candidate = typeof path === "string" ? path.trim() : "";
    if (!candidate) return fallback;

    const exists = await this.#imageExists(candidate);
    if (exists) return candidate;

    console.warn(`${LOG_PREFIX} Missing asset "${candidate}"; using fallback`);
    return fallback;
  }

  /**
   * @param {string} src
   * @returns {Promise<boolean>}
   */
  #imageExists(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  /**
   * Compose Actor biography HTML from TownForge roleplay fields.
   * @param {object} npc
   * @returns {string}
   */
  #buildBiographyHtml(npc) {
    const blocks = [];
    const biography = npc.biography || npc.description;
    if (biography) blocks.push(`<p>${this.#escapeHTML(biography)}</p>`);

    const extras = [
      ["Personality", npc.personality],
      ["Motivation", npc.motivation],
      ["Voice", npc.voice],
      ["Appearance", npc.appearance],
      ["Rumor", npc.rumor],
      ["Secret (GM)", npc.secret]
    ];

    for (const [label, value] of extras) {
      if (!value) continue;
      blocks.push(`<p><strong>${label}:</strong> ${this.#escapeHTML(value)}</p>`);
    }

    return blocks.join("");
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  #escapeHTML(value) {
    if (typeof foundry.utils.escapeHTML === "function") {
      return foundry.utils.escapeHTML(value);
    }
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  /**
   * @param {string} npcId
   * @returns {Promise<void>}
   */
  async #waitForSiblingCreate(npcId) {
    const started = Date.now();
    while (this.#creatingNpcIds.has(npcId) && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

/** Shared singleton used by the browser UI. */
export const actorService = new ActorService();
