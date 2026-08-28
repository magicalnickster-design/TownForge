/**
 * Token theme resolver tests.
 * Run: node tools/test_token_themes.mjs
 */

import { readFileSync } from "node:fs";
import { resolveTokenTheme } from "../scripts/token-ring-service.js";

const catalog = JSON.parse(readFileSync("data/token-themes.json", "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  resolveTokenTheme(
    {
      id: "pippa-reed",
      occupation: "Barmaid",
      category: "tavern",
      tags: ["server", "eager"]
    },
    catalog
  ) === "charming",
  "pippa is charming"
);

assert(
  resolveTokenTheme({ id: "serra-dawnpike", category: "guards", tags: [] }, catalog) === "guard",
  "guards category"
);

assert(
  resolveTokenTheme({ id: "lord-edric-vale", category: "nobility", tags: [] }, catalog) === "noble",
  "nobility category"
);

console.log("token theme tests passed");
