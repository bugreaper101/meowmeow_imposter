import { connectedPlayers } from "./playerManager.js";

export function canVote(room, voter, targetId) {
  if (room.phase !== "voting") return "wrong_phase";
  if (!voter.connected) return "disconnected";
  if (voter.vote) return "already_voted";
  const target = room.players.get(targetId);
  if (!target || !target.connected) return "invalid_target";
  if (target.id === voter.id) return "invalid_target";
  return null;
}

export function everyoneVoted(room) {
  const voters = connectedPlayers(room);
  return voters.length > 0 && voters.every((p) => p.vote);
}

export function tally(room) {
  const counts = new Map();
  for (const player of room.players.values()) {
    if (!player.vote) continue;
    counts.set(player.vote, (counts.get(player.vote) ?? 0) + 1);
  }
  let top = [];
  let best = 0;
  for (const [pid, n] of counts) {
    if (n > best) {
      best = n;
      top = [pid];
    } else if (n === best) top.push(pid);
  }
  const tie = top.length !== 1;
  return {
    counts: Object.fromEntries(counts),
    eliminatedId: tie ? null : top[0] ?? null,
    tie,
    total: [...counts.values()].reduce((a, b) => a + b, 0),
  };
}

export function clearVotes(room) {
  for (const player of room.players.values()) player.vote = null;
}