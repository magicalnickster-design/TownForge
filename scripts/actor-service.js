import { FLAGS, LOG_PREFIX, MODULE_ID } from "./constants.js";

/**
 * Foundry Actor / Token integration for TownForge NPCs.
 *
 * Responsibilities:
 * - Find an existing Actor created from a TownForge NPC id
 * - Create the Actor once if missing
 * - Place a token on the active scene near the viewport center
 *
 * Intentionally does not own UI state.
 */
export class ActorService {
  /**
   * Ensure an Actor exists for the given TownForge NPC, then place a token.
   * @param {object} npc Normalized TownForge NPC record
   * @returns {Promise<{actor: Actor, token: TokenDocument|null, createdActor: boolean}>}
   */
  async addNpcToScene(npc) {
    if (!npc?.id) {
      throw new Error("Cannot add NPC to scene without a stable npc id.");
    }

    if (!canvas?.ready || !canvas.scene) {
      ui.notifications?.warn("TownForge needs an active scene to place a token.");
      console.warn(`${LOG_PREFIX} Add to Scene aborted — no active scene.`);
      return { actor: null, token: null, createdActor: false };
    }

    if (!game.user?.isGM) {
      ui.notifications?.warn("Only the GM can add TownForge NPCs to the scene.");
      return { actor: null, token: null, createdActor: false };
    }

    const { actor, created } = await this.ensureActor(npc);
    const token = await this.placeTokenNearViewport(actor, npc);

    console.log(`${LOG_PREFIX} Added "${npc.name}" to scene`, {
      actorId: actor.id,
      tokenId: token?.id,
      createdActor: created
    });

    return { actor, token, createdActor: created };
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
      console.log(`${LOG_PREFIX} Reusing existing Actor for NPC "${npc.id}" (${existing.id})`);
      return { actor: existing, created: false };
    }

    const actorData = this.#buildActorData(npc);
    console.log(`${LOG_PREFIX} Creating Actor for NPC "${npc.id}"`);
    const createdActors = await Actor.implementation.create(actorData);
    const actor = Array.isArray(createdActors) ? createdActors[0] : createdActors;

    if (!actor) {
      throw new Error(`Failed to create Actor for TownForge NPC "${npc.id}".`);
    }

    return { actor, created: true };
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
   * @returns {Promise<TokenDocument|null>}
   */
  async placeTokenNearViewport(actor, npc) {
    const position = this.#getViewportCenterPosition(actor);
    const tokenSource = await actor.getTokenDocument(
      {
        x: position.x,
        y: position.y,
        actorLink: true,
        texture: {
          src: npc.token || actor.prototypeToken?.texture?.src || actor.img
        }
      },
      { parent: canvas.scene }
    );

    const created = await canvas.scene.createEmbeddedDocuments("Token", [
      tokenSource.toObject()
    ]);
    const token = Array.isArray(created) ? created[0] : created;
    return token ?? null;
  }

  /**
   * Build Actor create data from a TownForge NPC definition.
   * @param {object} npc
   * @returns {object}
   */
  #buildActorData(npc) {
    const base = foundry.utils.deepClone(npc.actorData ?? {});
    const biography = npc.description
      ? `<p>${foundry.utils.escapeHTML(npc.description)}</p>`
      : "";

    const data = foundry.utils.mergeObject(
      {
        name: npc.name,
        type: "npc",
        img: npc.portrait,
        prototypeToken: {
          name: npc.name,
          texture: {
            src: npc.token || npc.portrait
          },
          actorLink: true
        },
        system: {
          details: {
            biography: {
              value: biography
            }
          }
        },
        flags: {
          [MODULE_ID]: {
            [FLAGS.NPC_ID]: npc.id,
            [FLAGS.LIBRARY]: npc.library ?? "free",
            [FLAGS.SOURCE]: "townforge"
          }
        }
      },
      base,
      { inplace: false }
    );

    // Ensure identity flags always win over placeholder actorData.
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAGS.NPC_ID}`, npc.id);
    foundry.utils.setProperty(
      data,
      `flags.${MODULE_ID}.${FLAGS.LIBRARY}`,
      npc.library ?? "free"
    );
    foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAGS.SOURCE}`, "townforge");

    return data;
  }

  /**
   * Approximate the current viewport center in scene coordinates and snap to grid.
   * @param {Actor} actor
   * @returns {{x: number, y: number}}
   */
  #getViewportCenterPosition(actor) {
    const tokenWidth = Number(actor.prototypeToken?.width ?? 1);
    const tokenHeight = Number(actor.prototypeToken?.height ?? 1);
    const gridSize = canvas.grid?.size ?? 100;

    let centerX = canvas.stage?.pivot?.x;
    let centerY = canvas.stage?.pivot?.y;

    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      centerX = canvas.dimensions?.width / 2;
      centerY = canvas.dimensions?.height / 2;
    }

    // Anchor from top-left token coordinate around the viewport center.
    let x = centerX - (tokenWidth * gridSize) / 2;
    let y = centerY - (tokenHeight * gridSize) / 2;

    if (typeof canvas.grid?.getSnappedPoint === "function") {
      const snapped = canvas.grid.getSnappedPoint(
        { x, y },
        { mode: CONST.GRID_SNAPPING_MODES?.TOP_LEFT_CORNER ?? 0 }
      );
      x = snapped.x;
      y = snapped.y;
    }

    return { x, y };
  }
}

/** Shared singleton used by the browser UI. */
export const actorService = new ActorService();
