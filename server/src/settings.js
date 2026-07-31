import { config } from "./config.js";

const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const CLUE_ALLOWED = [0, 10, 30, 45, 60, 120, 180, 240, 300];
const DISCUSSION_ALLOWED = [0, 30, 60, 120, 180, 300, 420, 600];

export function normalizeSettings(input = {}, previous) {
  const base = previous ?? {
    rounds: 10,
    imposters: 1,
    clueSeconds: 45,
    discussionSeconds: 180,
    writerMode: "sequential",
  };
  const clue = Number(input.clueSeconds);
  const discussion = Number(input.discussionSeconds);
  return {
    rounds: clamp(input.rounds ?? base.rounds, 1, config.maxRounds, base.rounds),
    imposters: clamp(input.imposters ?? base.imposters, 1, config.maxImposters, base.imposters),
    clueSeconds: CLUE_ALLOWED.includes(clue) ? clue : base.clueSeconds,
    discussionSeconds: DISCUSSION_ALLOWED.includes(discussion) ? discussion : base.discussionSeconds,
    writerMode: input.writerMode === "random" ? "random" : input.writerMode === "sequential" ? "sequential" : base.writerMode,
  };
}