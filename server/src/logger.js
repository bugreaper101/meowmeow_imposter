import { isProd } from "./config.js";

// Never log secret words, roles, votes or raw voice payloads.
const REDACT = new Set(["secretWord", "word", "role", "roles", "votes", "vote", "signal"]);

function safe(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const out = {};
  for (const [k, v] of Object.entries(payload)) out[k] = REDACT.has(k) ? "[redacted]" : v;
  return out;
}

export const logger = {
  debug: (...a) => {
    if (!isProd) console.log("[debug]", ...a.map(safe));
  },
  info: (...a) => {
    if (!isProd) console.log("[info]", ...a.map(safe));
  },
  warn: (...a) => console.warn("[warn]", ...a.map(safe)),
  error: (...a) => console.error("[error]", ...a.map(safe)),
};