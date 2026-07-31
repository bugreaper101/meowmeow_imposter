import { send } from "./net.js";

// Voice never touches the gameplay queue. This module only relays WebRTC
// signalling (offer / answer / ICE) between peers already inside a room.
export function relaySignal(room, from, targetId, signal) {
  const target = room.players.get(targetId);
  if (!target || !target.connected) return;
  send(target, "rtc", { from: from.id, signal });
}

export function announcePeers(room) {
  const peers = [...room.players.values()].filter((p) => p.connected).map((p) => p.id);
  for (const player of room.players.values()) {
    send(player, "peers", { peers: peers.filter((pid) => pid !== player.id) });
  }
}

export function setVoiceState(player, mic, speaker) {
  if (typeof mic === "boolean") player.mic = mic;
  if (typeof speaker === "boolean") player.speaker = speaker;
}

export function closeVoice(room, playerId) {
  for (const player of room.players.values()) {
    if (player.id === playerId) continue;
    send(player, "rtc-close", { from: playerId });
  }
}