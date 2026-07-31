import { shuffle, pickRandom } from "./utils.js";
import { connectedPlayers } from "./playerManager.js";

// Writer selection is server-side only.
export function chooseWriter(room) {
  const eligible = connectedPlayers(room);
  if (!eligible.length) return null;
  if (room.settings.writerMode === "random") return pickRandom(eligible).id;

  // sequential: keep a rotating queue so everybody writes once before repeats
  room.writerQueue = room.writerQueue.filter((pid) => room.players.get(pid)?.connected);
  if (!room.writerQueue.length) room.writerQueue = eligible.sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
  return room.writerQueue.shift();
}

// Roles are assigned by the server and delivered in private packets only.
export function assignRoles(room) {
  const pool = connectedPlayers(room).filter((p) => p.id !== room.writerId);
  const count = Math.max(1, Math.min(room.settings.imposters, Math.max(1, pool.length - 1)));
  const imposters = shuffle(pool).slice(0, count);
  room.imposterIds = imposters.map((p) => p.id);

  for (const player of room.players.values()) {
    if (player.id === room.writerId) player.role = "writer";
    else if (room.imposterIds.includes(player.id)) player.role = "imposter";
    else player.role = "player";
  }
  return room.imposterIds;
}

export function clearRoles(room) {
  room.imposterIds = [];
  room.secretWord = null;
  for (const player of room.players.values()) player.role = null;
}