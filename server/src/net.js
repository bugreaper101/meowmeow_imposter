import { publicRoom, privateFor } from "./serialize.js";
import { logger } from "./logger.js";

export function send(player, type, payload = {}) {
  const socket = player?.socket;
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify({ t: type, ...payload }));
  } catch (error) {
    logger.warn("send failed", String(error));
  }
}

export function sendSocket(socket, type, payload = {}) {
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify({ t: type, ...payload }));
  } catch {
    /* socket closed mid-flight */
  }
}

export function broadcast(room, type, payload = {}) {
  for (const player of room.players.values()) send(player, type, payload);
}

// One broadcast of the shared state + one private packet per player.
export function sync(room) {
  const state = publicRoom(room);
  for (const player of room.players.values()) {
    send(player, "room", { room: state });
    send(player, "private", { private: privateFor(room, player) });
  }
}

export function fail(player, code, message) {
  send(player, "error", { code, message });
}