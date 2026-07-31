import { id, token, now } from "./utils.js";

export function createPlayer({ nickname, avatar, socket }) {
  return {
    id: id("p"),
    token: token(),
    nickname,
    avatar,
    socket,
    connected: true,
    ready: false,
    roleSeen: false,
    role: null,
    vote: null,
    score: 0,
    roundScore: 0,
    mic: true,
    speaker: true,
    joinedAt: now(),
    lastSeen: now(),
    disconnectAt: null,
    events: [],
  };
}

export function resetForRound(player) {
  player.ready = false;
  player.roleSeen = false;
  player.role = null;
  player.vote = null;
  player.roundScore = 0;
}

export function resetForMatch(player, keepScores) {
  resetForRound(player);
  if (!keepScores) player.score = 0;
}

export function nicknameTaken(room, nickname, exceptId) {
  const wanted = nickname.toLowerCase();
  return [...room.players.values()].some((p) => p.id !== exceptId && p.nickname.toLowerCase() === wanted);
}

export function avatarTaken(room, avatar, exceptId) {
  return [...room.players.values()].some((p) => p.id !== exceptId && p.avatar === avatar);
}

export function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}