import { config } from "./config.js";
import { sync, broadcast } from "./net.js";
import { startTimer, clearTimer } from "./timerManager.js";
import { assignRoles, chooseWriter, clearRoles } from "./roleManager.js";
import { clearVotes, everyoneVoted, tally } from "./voteManager.js";
import { connectedPlayers, resetForRound, resetForMatch } from "./playerManager.js";
import { shuffle } from "./utils.js";

export function canStart(room) {
  const players = connectedPlayers(room);
  if (players.length < config.minPlayers) return "not_enough_players";
  if (players.some((p) => !p.avatar)) return "avatar_missing";
  if (room.settings.imposters >= players.length - 1) return "too_many_imposters";
  return null;
}

export function startRound(room) {
  room.round += 1;
  room.locked = true;
  room.result = null;
  room.revealedWord = null;
  room.eliminatedId = null;
  room.speakingOrder = [];
  room.speakerIndex = 0;
  room.currentSpeakerId = null;
  clearRoles(room);
  clearVotes(room);
  for (const player of room.players.values()) resetForRound(player);

  room.writerId = chooseWriter(room);
  room.phase = "writer";
  startTimer(room, "writer", config.writerSeconds, () => onWriterTimeout(room));
  sync(room);
}

function onWriterTimeout(room) {
  // Writer went silent: fall back to a neutral word so the match keeps moving.
  submitWord(room, room.players.get(room.writerId), "marshmallow", true);
}

export function submitWord(room, writer, word, forced = false) {
  if (room.phase !== "writer") return "wrong_phase";
  if (!forced && (!writer || writer.id !== room.writerId)) return "not_writer";
  room.secretWord = word;
  clearTimer(room);
  assignRoles(room);
  room.phase = "roleReveal";
  startTimer(room, "roleReveal", config.roleRevealSeconds, () => toReady(room));
  sync(room);
  return null;
}

export function markRoleSeen(room, player) {
  if (room.phase !== "roleReveal") return;
  player.roleSeen = true;
  if (connectedPlayers(room).every((p) => p.roleSeen)) toReady(room);
  else sync(room);
}

export function toReady(room) {
  if (room.phase === "ready") return;
  clearTimer(room);
  room.phase = "ready";
  for (const player of room.players.values()) player.ready = false;
  startTimer(room, "ready", config.readySeconds, () => toClue(room));
  sync(room);
}

export function markReady(room, player) {
  if (room.phase !== "ready" || player.ready) return;
  player.ready = true;
  if (connectedPlayers(room).every((p) => p.ready)) toClue(room);
  else sync(room);
}

export function toClue(room) {
  clearTimer(room);
  room.phase = "clue";
  const order = connectedPlayers(room).map((p) => p.id);
  room.speakingOrder = room.settings.writerMode === "random" ? shuffle(order) : order;
  room.speakerIndex = 0;
  room.currentSpeakerId = room.speakingOrder[0] ?? null;
  armSpeakerTimer(room);
  sync(room);
}

function armSpeakerTimer(room) {
  startTimer(room, "clue", room.settings.clueSeconds, () => nextSpeaker(room, true));
}

export function nextSpeaker(room, fromTimer = false) {
  if (room.phase !== "clue") return;
  if (!fromTimer) clearTimer(room);
  room.speakerIndex += 1;
  if (room.speakerIndex >= room.speakingOrder.length) {
    toDiscussion(room);
    return;
  }
  room.currentSpeakerId = room.speakingOrder[room.speakerIndex];
  armSpeakerTimer(room);
  sync(room);
}

export function toDiscussion(room) {
  clearTimer(room);
  room.phase = "discussion";
  room.currentSpeakerId = null;
  startTimer(room, "discussion", room.settings.discussionSeconds, () => toVoting(room));
  sync(room);
}

export function toVoting(room) {
  clearTimer(room);
  room.phase = "voting";
  clearVotes(room);
  startTimer(room, "voting", config.votingSeconds, () => finishVoting(room));
  sync(room);
}

export function castVote(room, voter, targetId) {
  voter.vote = targetId;
  if (everyoneVoted(room)) finishVoting(room);
  else sync(room);
}

export function finishVoting(room) {
  if (room.phase !== "voting") return;
  clearTimer(room);
  const outcome = tally(room);
  const eliminated = outcome.eliminatedId ? room.players.get(outcome.eliminatedId) : null;
  const caughtImposter = Boolean(eliminated && room.imposterIds.includes(eliminated.id));

  for (const player of room.players.values()) {
    player.roundScore = 0;
    if (!player.connected) continue;
    const isImposter = room.imposterIds.includes(player.id);
    if (caughtImposter && !isImposter && player.id !== room.writerId) player.roundScore = config.scoreInnocentWin;
    if (caughtImposter && player.id === room.writerId) player.roundScore = config.scoreWriterBonus;
    if (!caughtImposter && isImposter) player.roundScore = config.scoreImposterWin;
    player.score += player.roundScore;
  }

  room.eliminatedId = eliminated?.id ?? null;
  room.revealedWord = room.secretWord;
  room.result = {
    eliminatedId: eliminated?.id ?? null,
    eliminatedRole: eliminated ? (room.imposterIds.includes(eliminated.id) ? "imposter" : eliminated.id === room.writerId ? "writer" : "player") : null,
    tie: outcome.tie,
    counts: outcome.counts,
    winner: caughtImposter ? "innocents" : "imposters",
    secretWord: room.secretWord,
    points: caughtImposter ? config.scoreInnocentWin : config.scoreImposterWin,
  };
  room.phase = "result";
  for (const player of room.players.values()) player.roleSeen = false;
  startTimer(room, "result", config.resultSeconds, () => toScoreboard(room));
  sync(room);
}

export function acknowledgeResult(room, player) {
  if (room.phase !== "result") return;
  player.roleSeen = true;
  if (connectedPlayers(room).every((p) => p.roleSeen)) toScoreboard(room);
  else sync(room);
}

export function toScoreboard(room) {
  clearTimer(room);
  room.phase = "scoreboard";
  sync(room);
}

export function nextRound(room) {
  if (room.round >= room.settings.rounds) {
    finishMatch(room);
    return;
  }
  startRound(room);
}

export function finishMatch(room) {
  clearTimer(room);
  room.phase = "winner";
  room.currentSpeakerId = null;
  room.locked = true;
  sync(room);
  broadcast(room, "celebrate", {});
}

// Play again inside the same room: everything transient is wiped.
export function playAgain(room, keepScores = false) {
  clearTimer(room);
  clearRoles(room);
  clearVotes(room);
  room.round = 0;
  room.result = null;
  room.revealedWord = null;
  room.eliminatedId = null;
  room.speakingOrder = [];
  room.speakerIndex = 0;
  room.currentSpeakerId = null;
  room.writerId = null;
  room.writerQueue = [];
  room.locked = false;
  room.phase = "lobby";
  for (const player of room.players.values()) resetForMatch(player, keepScores);
  sync(room);
}

export function returnToLobby(room) {
  playAgain(room, true);
}

// A disconnect can strand a phase; keep the match moving.
export function reconcileAfterLeave(room) {
  const players = connectedPlayers(room);
  if (!players.length) return;
  switch (room.phase) {
    case "writer":
      if (!room.players.get(room.writerId)?.connected) {
        room.writerId = chooseWriter(room);
        sync(room);
      }
      break;
    case "roleReveal":
      if (players.every((p) => p.roleSeen)) toReady(room);
      break;
    case "ready":
      if (players.every((p) => p.ready)) toClue(room);
      break;
    case "clue":
      if (!room.players.get(room.currentSpeakerId)?.connected) nextSpeaker(room);
      break;
    case "voting":
      if (everyoneVoted(room)) finishVoting(room);
      break;
    case "result":
      if (players.every((p) => p.roleSeen)) toScoreboard(room);
      break;
    default:
      break;
  }
}