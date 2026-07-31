import { config } from "./config.js";
import { logger } from "./logger.js";
import { roomCode, now } from "./utils.js";
import { clearTimer } from "./timerManager.js";

// Every room lives only in this Map. No database, no disk, no cache layer.
const rooms = new Map();

export function createRoom(settings) {
  let code = roomCode();
  while (rooms.has(code)) code = roomCode();

  const room = {
    code,
    createdAt: now(),
    destroyed: false,
    players: new Map(),
    hostId: null,
    phase: "lobby",
    round: 0,
    settings,
    locked: false,
    writerId: null,
    writerQueue: [],
    secretWord: null,
    revealedWord: null,
    imposterIds: [],
    speakingOrder: [],
    speakerIndex: 0,
    currentSpeakerId: null,
    eliminatedId: null,
    result: null,
    timer: null,
    emptySince: null,
  };
  rooms.set(code, room);
  logger.info("room created", { code });
  return room;
}

export const getRoom = (code) => rooms.get(String(code || "").trim());
export const roomCount = () => rooms.size;
export const allRooms = () => [...rooms.values()];

export function addPlayer(room, player) {
  room.players.set(player.id, player);
  room.emptySince = null;
  if (!room.hostId) room.hostId = player.id;
  return player;
}

export function removePlayer(room, playerId) {
  const player = room.players.get(playerId);
  if (!player) return null;
  room.players.delete(playerId);
  if (room.speakingOrder.includes(playerId)) {
    room.speakingOrder = room.speakingOrder.filter((pid) => pid !== playerId);
  }
  if (!room.players.size) room.emptySince = now();
  return player;
}

// Oldest connected player inherits the host controls.
export function migrateHost(room) {
  if (room.players.get(room.hostId)?.connected) return false;
  const next = [...room.players.values()].filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (!next) return false;
  room.hostId = next.id;
  logger.info("host migrated", { code: room.code });
  return true;
}

export function destroyRoom(room, reason = "empty") {
  if (!room || room.destroyed) return;
  clearTimer(room);
  room.destroyed = true;
  room.secretWord = null;
  room.imposterIds = [];
  room.speakingOrder = [];
  room.result = null;
  for (const player of room.players.values()) {
    player.socket = null;
    player.role = null;
    player.vote = null;
  }
  room.players.clear();
  rooms.delete(room.code);
  logger.info("room destroyed", { code: room.code, reason });
}

// Sweeper: frees rooms nobody is using, plus rooms past their max lifetime.
export function startCleanupLoop() {
  return setInterval(() => {
    const t = now();
    for (const room of rooms.values()) {
      const anyConnected = [...room.players.values()].some((p) => p.connected);
      if (!room.players.size && room.emptySince && t - room.emptySince > config.emptyRoomGraceMs) {
        destroyRoom(room, "empty");
        continue;
      }
      if (!anyConnected && room.players.size && t - (room.emptySince ?? t) > config.reconnectGraceMs * 2) {
        destroyRoom(room, "abandoned");
        continue;
      }
      if (t - room.createdAt > config.roomMaxLifetimeMs) destroyRoom(room, "expired");
    }
  }, 5000);
}