import { config } from "./config.js";
import { logger } from "./logger.js";
import { cleanText, isEmojiOnly, now } from "./utils.js";
import { normalizeSettings } from "./settings.js";
import { fail, send, sendSocket, sync } from "./net.js";
import { addPlayer, createRoom, destroyRoom, getRoom, migrateHost, removePlayer } from "./roomManager.js";
import { avatarTaken, connectedPlayers, createPlayer, nicknameTaken } from "./playerManager.js";
import * as game from "./gameManager.js";
import { canVote } from "./voteManager.js";
import { announcePeers, closeVoice, relaySignal, setVoiceState } from "./voiceManager.js";

// socket -> { room, player }
const sessions = new Map();

function rateLimited(player) {
  const t = now();
  player.events = player.events.filter((ts) => t - ts < config.rateWindowMs);
  player.events.push(t);
  return player.events.length > config.rateMaxEvents;
}

function attach(socket, room, player) {
  player.socket = socket;
  sessions.set(socket, { room, player });
  sendSocket(socket, "session", { playerId: player.id, token: player.token, code: room.code });
}

function validNickname(value) {
  const nickname = cleanText(value, config.nicknameMax);
  if (nickname.length < config.nicknameMin) return null;
  return nickname;
}

export function handleMessage(socket, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg.t !== "string") return;

  const session = sessions.get(socket);
  if (msg.t === "createRoom") return onCreateRoom(socket, msg);
  if (msg.t === "joinRoom") return onJoinRoom(socket, msg);
  if (msg.t === "resume") return onResume(socket, msg);
  if (msg.t === "ping") return sendSocket(socket, "pong", { at: now() });

  if (!session) return sendSocket(socket, "error", { code: "no_session", message: "You are not in a room." });
  const { room, player } = session;
  if (room.destroyed) return sendSocket(socket, "error", { code: "room_gone", message: "That room no longer exists." });
  if (rateLimited(player)) return; // silently drop spam
  player.lastSeen = now();

  switch (msg.t) {
    case "selectAvatar":
      return onSelectAvatar(room, player, msg);
    case "updateSettings":
      return onUpdateSettings(room, player, msg);
    case "startGame":
      return onStartGame(room, player);
    case "submitWord":
      return onSubmitWord(room, player, msg);
    case "roleSeen":
      return game.markRoleSeen(room, player);
    case "ready":
      return game.markReady(room, player);
    case "skipTurn":
    case "finishTurn":
      if (room.phase !== "clue") return;
      if (player.id !== room.currentSpeakerId && player.id !== room.hostId) return;
      return game.nextSpeaker(room);
    case "skipDiscussion":
      if (room.phase !== "discussion" || player.id !== room.hostId) return;
      return game.toVoting(room);
    case "vote":
      return onVote(room, player, msg);
    case "continueResult":
      return game.acknowledgeResult(room, player);
    case "nextRound":
      if (player.id !== room.hostId) return fail(player, "not_host", "Only the host can do that.");
      return game.nextRound(room);
    case "finishMatch":
      if (player.id !== room.hostId) return fail(player, "not_host", "Only the host can do that.");
      return game.finishMatch(room);
    case "playAgain":
      if (player.id !== room.hostId) return fail(player, "not_host", "Only the host can do that.");
      return game.playAgain(room, Boolean(msg.keepScores));
    case "returnLobby":
      if (player.id !== room.hostId) return fail(player, "not_host", "Only the host can do that.");
      return game.returnToLobby(room);
    case "voiceState":
      setVoiceState(player, msg.mic, msg.speaker);
      return sync(room);
    case "rtc":
      return relaySignal(room, player, msg.to, msg.signal);
    case "leaveRoom":
      return leave(socket, true);
    default:
      return fail(player, "unknown_event", "Unsupported action.");
  }
}

function onCreateRoom(socket, msg) {
  const nickname = validNickname(msg.nickname);
  if (!nickname) return sendSocket(socket, "error", { code: "bad_nickname", message: "Nicknames need at least 3 letters." });
  const avatar = cleanText(msg.avatar, 40) || null;

  const room = createRoom(normalizeSettings(msg.settings));
  const player = createPlayer({ nickname, avatar, socket });
  addPlayer(room, player);
  attach(socket, room, player);
  announcePeers(room);
  sync(room);
  logger.info("player created room", { code: room.code });
}

function onJoinRoom(socket, msg) {
  const room = getRoom(msg.code);
  if (!room || room.destroyed) return sendSocket(socket, "error", { code: "room_not_found", message: "We couldn't find that room." });
  if (room.players.size >= config.maxPlayers) return sendSocket(socket, "error", { code: "room_full", message: "This room is full." });
  if (room.phase !== "lobby") return sendSocket(socket, "error", { code: "room_locked", message: "That match already started." });

  const nickname = validNickname(msg.nickname);
  if (!nickname) return sendSocket(socket, "error", { code: "bad_nickname", message: "Nicknames need at least 3 letters." });
  if (nicknameTaken(room, nickname)) return sendSocket(socket, "error", { code: "nickname_taken", message: "Someone already uses that nickname." });

  const avatar = cleanText(msg.avatar, 40) || null;
  if (avatar && avatarTaken(room, avatar)) return sendSocket(socket, "error", { code: "avatar_taken", message: "That kitty is already taken." });

  const player = createPlayer({ nickname, avatar, socket });
  addPlayer(room, player);
  attach(socket, room, player);
  announcePeers(room);
  sync(room);
}

// Reconnection: the slot stays reserved for config.reconnectGraceMs.
function onResume(socket, msg) {
  const room = getRoom(msg.code);
  if (!room || room.destroyed) return sendSocket(socket, "error", { code: "room_not_found", message: "That room has closed." });
  const player = [...room.players.values()].find((p) => p.token === msg.token);
  if (!player) return sendSocket(socket, "error", { code: "resume_failed", message: "Your seat expired." });

  player.connected = true;
  player.disconnectAt = null;
  attach(socket, room, player);
  migrateHost(room);
  announcePeers(room);
  sync(room);
  logger.info("player resumed", { code: room.code });
}

function onSelectAvatar(room, player, msg) {
  const avatar = cleanText(msg.avatar, 40);
  if (!avatar) return fail(player, "bad_avatar", "Pick a kitty first.");
  if (avatarTaken(room, avatar, player.id)) return fail(player, "avatar_taken", "That kitty is already taken.");
  player.avatar = avatar;
  sync(room);
}

function onUpdateSettings(room, player, msg) {
  if (player.id !== room.hostId) return fail(player, "not_host", "Only the host can change settings.");
  if (room.locked) return fail(player, "settings_locked", "Settings lock once the game begins.");
  room.settings = normalizeSettings(msg.settings, room.settings);
  sync(room);
}

function onStartGame(room, player) {
  if (player.id !== room.hostId) return fail(player, "not_host", "Only the host can start.");
  if (room.phase !== "lobby") return;
  const problem = game.canStart(room);
  if (problem === "not_enough_players") return fail(player, problem, `You need at least ${config.minPlayers} kitties.`);
  if (problem === "avatar_missing") return fail(player, problem, "Everyone needs an avatar first.");
  if (problem === "too_many_imposters") return fail(player, problem, "Too many imposters for this many kitties.");
  game.startRound(room);
}

function onSubmitWord(room, player, msg) {
  const word = cleanText(msg.word, config.wordMax);
  if (!word) return fail(player, "bad_word", "The secret word can't be empty.");
  if (isEmojiOnly(word)) return fail(player, "bad_word", "The secret word needs real letters.");
  const problem = game.submitWord(room, player, word);
  if (problem) fail(player, problem, "You can't submit a word right now.");
}

function onVote(room, player, msg) {
  const problem = canVote(room, player, msg.targetId);
  if (problem === "already_voted") return; // ignore duplicates silently
  if (problem) return fail(player, problem, "That vote isn't allowed.");
  game.castVote(room, player, msg.targetId);
}

export function handleClose(socket) {
  leave(socket, false);
}

function leave(socket, intentional) {
  const session = sessions.get(socket);
  sessions.delete(socket);
  if (!session) return;
  const { room, player } = session;
  if (room.destroyed) return;

  player.socket = null;
  player.connected = false;
  player.disconnectAt = now();
  closeVoice(room, player.id);

  const inLobby = room.phase === "lobby" || room.phase === "winner";
  if (intentional || inLobby) {
    removePlayer(room, player.id);
  } else {
    // keep the seat warm for a reconnect
    setTimeout(() => {
      if (room.destroyed) return;
      const stale = room.players.get(player.id);
      if (!stale || stale.connected) return;
      removePlayer(room, player.id);
      if (migrateHost(room)) {
        /* host controls moved */
      }
      if (!connectedPlayers(room).length) return;
      game.reconcileAfterLeave(room);
      sync(room);
      announcePeers(room);
    }, config.reconnectGraceMs);
  }

  migrateHost(room);
  if (!room.players.size) {
    destroyRoom(room, "last player left");
    return;
  }
  game.reconcileAfterLeave(room);
  announcePeers(room);
  sync(room);
}

export const sessionCount = () => sessions.size;