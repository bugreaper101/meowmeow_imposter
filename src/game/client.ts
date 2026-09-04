import type { PrivateState, PublicPlayer, RoomSettings, RoomState, ServerMessage, Role } from "./protocol";
import { getGameState, resetGameState, setGameState } from "./store";
import { getClientId, loadHostRoom, loadSession, saveHostRoom, saveSession } from "./prefs";
import { connectRelay, disconnectRelay, inboxPath, isRelayReady, privatePath, relayPublish } from "./relay";

type Outgoing = Record<string, unknown> & { t: string };
type SignalHandler = (from: string, signal: unknown) => void;
type Wire = { peer: string; send?: (msg: unknown) => void };

type PlayerRecord = {
  id: string;
  peerId: string;
  nickname: string;
  avatar: string | null;
  connected: boolean;
  host: boolean;
  ready: boolean;
  score: number;
  roundScore: number;
  voted: boolean;
  mic: boolean;
  speaker: boolean;
  speaking: boolean;
  eliminated: boolean;
  role: Role;
  roleSeen: boolean;
  vote: string | null;
  viewing: "result" | "scoreboard" | null;
  joinedAt: number;
  clientId: string | null;
};

type HostRoom = {
  code: string;
  phase: RoomState["phase"];
  round: number;
  maxRounds: number;
  hostId: string | null;
  locked: boolean;
  finished: boolean;
  settings: RoomSettings;
  writerId: string | null;
  writerQueue: string[];
  lastWriterId: string | null;
  speakingOrder: string[];
  currentSpeakerId: string | null;
  timer: RoomState["timer"];
  takenAvatars: string[];
  voted: string[];
  result: RoomState["result"];
  revealedWord: string | null;
  secretWord: string | null;
  players: PlayerRecord[];
  eliminatedId: string | null;
  hostPeerId: string;
};

let queue: Outgoing[] = [];
let intentionalClose = false;
let joinRetryTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let signalHandler: SignalHandler | null = null;
let closeHandler: ((from: string) => void) | null = null;
let mode: "host" | "guest" | "none" = "none";
let currentRoomCode: string | null = null;
let currentHostPeerId: string | null = null;
let currentPlayerId: string | null = null;
let currentPlayerNick: string | null = null;
let currentAvatar: string | null = null;
let currentToken: string | null = null;
let localRoom: HostRoom | null = null;
let peerConnections = new Map<string, Wire>();
let autoAdvanceTimer: ReturnType<typeof setInterval> | null = null;
let relayBound = false;

function flushQueuedMessages() {
  if (mode !== "guest" || !currentRoomCode || !isRelayReady()) return;
  const pending = queue;
  queue = [];
  for (const msg of pending) {
    const sent = relayPublish(inboxPath(currentRoomCode), { ...msg, clientId: getClientId() });
    if (!sent) queue.push(msg);
  }
}

function wireClient(clientId: string) {
  if (!currentRoomCode || !clientId) return;
  const code = currentRoomCode;
  peerConnections.set(clientId, {
    peer: clientId,
    send: (msg: unknown) => {
      relayPublish(privatePath(code, clientId), msg);
    },
  });
}

function generateRoomCode() {
  return `${Math.floor(10000 + Math.random() * 90000)}`;
}

function generatePlayerId() {
  return `p_${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_PLAYERS = 30;

function hostPeerId(code: string) {
  return `mmi-${code.trim().toUpperCase()}-host`;
}

function createDefaultRoom(code: string): HostRoom {
  return {
    code,
    phase: "lobby",
    round: 0,
    maxRounds: 10,
    hostId: null,
    locked: false,
    finished: false,
    settings: {
      rounds: 10,
      imposters: 1,
      clueSeconds: 45,
      discussionSeconds: 180,
      writerMode: "sequential",
    },
    writerId: null,
    writerQueue: [],
    lastWriterId: null,
    speakingOrder: [],
    currentSpeakerId: null,
    timer: null,
    takenAvatars: [],
    voted: [],
    result: null,
    revealedWord: null,
    secretWord: null,
    players: [],
    eliminatedId: null,
    hostPeerId: hostPeerId(code),
  };
}

function buildPublicRoom(room: HostRoom): RoomState {
  const takenAvatars = [...new Set(room.players.map((player) => player.avatar).filter(Boolean) as string[])];
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    maxRounds: room.maxRounds,
    hostId: room.hostId,
    locked: room.locked,
    finished: room.finished,
    settings: { ...room.settings },
    writerId: room.writerId,
    speakingOrder: [...room.speakingOrder],
    currentSpeakerId: room.currentSpeakerId,
    timer: room.timer,
    takenAvatars,
    voted: [...room.voted],
    result: room.result,
    revealedWord: room.revealedWord,
    players: room.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      ready: player.ready,
      connected: player.connected,
      host: player.host,
      score: player.score,
      roundScore: player.roundScore,
      voted: player.voted,
      mic: player.mic,
      speaker: player.speaker,
      speaking: player.speaking,
      eliminated: player.eliminated,
      roleSeen: player.roleSeen,
    })),
  };
}

function buildPrivateState(room: HostRoom, playerId: string): PrivateState {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    return { playerId, role: null, secretWord: null, isWriter: false, isHost: false, roleSeen: false, ready: false, vote: null, viewing: null };
  }
  const isWriter = room.writerId === player.id;
  const isImposter = player.role === "imposter";
  const roleAssigned = player.role != null;
  return {
    playerId,
    role: player.role,
    secretWord: roleAssigned && !isImposter ? room.secretWord : null,
    isWriter,
    isHost: room.hostId === player.id,
    roleSeen: player.roleSeen,
    ready: player.ready,
    vote: player.vote,
    viewing: player.viewing,
  };
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = result[index]!;
    const swapValue = result[swapIndex]!;
    [result[index], result[swapIndex]] = [swapValue, current];
  }
  return result;
}

function getConnectedPlayers(room: HostRoom): PlayerRecord[] {
  return room.players.filter((entry) => entry.connected);
}

function getOrderedPlayers(room: HostRoom): PlayerRecord[] {
  return [...getConnectedPlayers(room)].sort((a, b) => a.joinedAt - b.joinedAt || a.nickname.localeCompare(b.nickname));
}

function buildWriterOrder(room: HostRoom, connectedPlayers: PlayerRecord[]): string[] {
  const orderedIds = connectedPlayers.map((player) => player.id);
  if (!orderedIds.length) return [];

  if (room.settings.writerMode === "random") {
    return shuffle(orderedIds);
  }

  if (!room.lastWriterId) return orderedIds;
  const lastIndex = orderedIds.indexOf(room.lastWriterId);
  if (lastIndex === -1) return orderedIds;
  return [...orderedIds.slice(lastIndex + 1), ...orderedIds.slice(0, lastIndex + 1)];
}

function buildClueOrder(room: HostRoom, connectedPlayers: PlayerRecord[]): string[] {
  const orderedIds = connectedPlayers.map((player) => player.id);
  if (room.settings.writerMode === "random") {
    return shuffle(orderedIds);
  }
  return orderedIds;
}

function assignRoles(room: HostRoom, writerId: string | null) {
  const connectedPlayers = getConnectedPlayers(room);
  const eligibleIds = connectedPlayers.filter((player) => player.id !== writerId).map((player) => player.id);
  const count = Math.max(0, Math.min(room.settings.imposters, eligibleIds.length));
  const imposterIds = shuffle(eligibleIds).slice(0, count);
  room.players.forEach((player) => {
    if (player.id === writerId) player.role = "writer";
    else if (imposterIds.includes(player.id)) player.role = "imposter";
    else player.role = "player";
  });
}

function setRoomTimer(room: HostRoom, phase: RoomState["phase"], seconds: number | null) {
  room.timer = seconds && seconds > 0
    ? { phase, endsAt: Date.now() + seconds * 1000, duration: seconds }
    : { phase, endsAt: null, duration: seconds ?? 0 };
}

function startCluePhase(room: HostRoom) {
  room.phase = "clue";
  room.currentSpeakerId = room.speakingOrder[0] ?? getOrderedPlayers(room)[0]?.id ?? null;
  setRoomTimer(room, "clue", room.settings.clueSeconds);
  startAutoAdvanceTimer();
}

function advanceClueTurn(room: HostRoom) {
  if (room.phase !== "clue") return;
  const currentIndex = room.speakingOrder.indexOf(room.currentSpeakerId ?? "");
  const nextIndex = currentIndex + 1;
  if (nextIndex < room.speakingOrder.length) {
    room.currentSpeakerId = room.speakingOrder[nextIndex] ?? null;
    setRoomTimer(room, "clue", room.settings.clueSeconds);
    return;
  }
  room.currentSpeakerId = null;
  room.phase = "discussion";
  setRoomTimer(room, "discussion", room.settings.discussionSeconds);
  startAutoAdvanceTimer();
}

function applyRoundScores(players: Array<{ id: string; role: Role; connected: boolean; vote: string | null; roundScore: number; score: number }>, imposterIds: string[], eliminatedId: string | null, tie: boolean, everyoneVotedImposter: boolean) {
  const eliminatedIsImposter = Boolean(eliminatedId && imposterIds.includes(eliminatedId));
  const majorityAgainstImposter = Boolean(eliminatedId && eliminatedIsImposter && !tie);
  const imposterSurvives = !majorityAgainstImposter;

  players.forEach((player) => {
    let roundScore = 0;
    const isImposter = imposterIds.includes(player.id);
    const votedImposter = Boolean(player.vote && imposterIds.includes(player.vote));
    const votedOthers = Boolean(player.vote && !imposterIds.includes(player.vote));

    if (!player.connected) {
      player.roundScore = 0;
      return;
    }

    if (majorityAgainstImposter) {
      if (everyoneVotedImposter) {
        if (isImposter) roundScore -= 40;
        else roundScore += 40;
      } else {
        if (isImposter) roundScore -= 20;
        else if (votedImposter) roundScore += 20;
        else if (votedOthers) roundScore -= 10;
      }
    } else if (imposterSurvives) {
      if (isImposter) roundScore += 50;
      else if (votedImposter) roundScore += 10;
      else if (votedOthers || !player.vote) roundScore -= 10;
    }

    player.roundScore = roundScore;
    player.score += roundScore;
  });
}

export { applyRoundScores };

function finalizeDiscussion(room: HostRoom) {
  if (room.phase !== "discussion") return;
  const connectedPlayers = getConnectedPlayers(room);
  const counts: Record<string, number> = {};
  const votes: Record<string, string | null> = {};
  for (const player of connectedPlayers) {
    votes[player.id] = player.vote ?? null;
    if (!player.vote) continue;
    counts[player.vote] = (counts[player.vote] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topEntry = entries[0];
  const topCount = topEntry?.[1] ?? 0;
  const tied = entries.length > 1 && entries[1]?.[1] === topCount;
  const eliminated = topEntry ? room.players.find((player) => player.id === topEntry[0]) ?? null : null;
  const imposterIds = room.players.filter((player) => player.role === "imposter").map((player) => player.id);
  const everyoneVotedImposter = Boolean(connectedPlayers.length > 0 && connectedPlayers.every((player) => player.vote && imposterIds.includes(player.vote)));
  const majorityAgainstImposter = Boolean(eliminated && eliminated.role === "imposter" && !tied);
  applyRoundScores(
    room.players as Array<{ id: string; role: Role; connected: boolean; vote: string | null; roundScore: number; score: number }>,
    imposterIds,
    tied || !topEntry ? null : eliminated?.id ?? null,
    Boolean(tied),
    everyoneVotedImposter,
  );
  const roles: Record<string, Role> = {};
  for (const player of room.players) {
    roles[player.id] = player.role;
  }
  room.phase = "result";
  room.voted = connectedPlayers.filter((player) => player.vote).map((player) => player.id);
  room.result = {
    eliminatedId: tied || !topEntry ? null : eliminated?.id ?? null,
    eliminatedRole: tied || !topEntry ? null : eliminated?.role ?? null,
    tie: Boolean(tied),
    counts,
    votes,
    roles,
    winner: majorityAgainstImposter ? "innocents" : "imposters",
    secretWord: room.secretWord,
    points: everyoneVotedImposter ? 40 : majorityAgainstImposter ? 20 : 50,
  };
  room.timer = { phase: "result", endsAt: null, duration: 0 };
}

function publishRoom(room: HostRoom, fromPeerId?: string) {
  const publicRoom = buildPublicRoom(room);
  const peers = [...peerConnections.keys()].filter((peerId) => peerId !== fromPeerId);
  for (const player of room.players) {
    const target = peerConnections.get(player.peerId);
    if (!target) continue;
    try {
      target.send({ t: "room", room: publicRoom });
      target.send({ t: "private", private: buildPrivateState(room, player.id) });
      target.send({ t: "peers", peers });
    } catch {
      // ignore disconnect races
    }
  }
}

function persistSession() {
  if (!currentRoomCode || !currentPlayerId || (mode !== "host" && mode !== "guest")) {
    saveSession(null);
    if (mode !== "host") saveHostRoom(null);
    return;
  }
  saveSession({
    mode,
    code: currentRoomCode,
    playerId: currentPlayerId,
    token: currentToken || `${currentRoomCode}-${currentPlayerId}`,
    nickname: currentPlayerNick,
    avatar: currentAvatar,
    hostPeerId: currentHostPeerId,
  });
  if (mode === "host" && localRoom) {
    saveHostRoom({ playerId: currentPlayerId, room: localRoom });
  }
}

function publishStateToAll() {
  if (!localRoom) return;
  publishRoom(localRoom);
  updateStoreFromRoom(localRoom);
  persistSession();
}

function updateStoreFromRoom(room: HostRoom) {
  const publicRoom = buildPublicRoom(room);
  const self = localRoom && currentPlayerId ? buildPrivateState(room, currentPlayerId) : null;
  setGameState({ room: publicRoom, self, peers: [...peerConnections.keys()] });
}

function broadcastToClients(msg: ServerMessage) {
  if (!localRoom) return;
  for (const player of localRoom.players) {
    const conn = peerConnections.get(player.peerId);
    if (!conn) continue;
    try {
      conn.send(msg);
    } catch {
      // ignore disconnect races
    }
  }
}

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer) {
    clearInterval(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
}

function startAutoAdvanceTimer() {
  if (autoAdvanceTimer || mode !== "host" || !localRoom) return;
  autoAdvanceTimer = setInterval(() => {
    if (!localRoom || mode !== "host") return;
    if (localRoom.phase === "discussion" && localRoom.timer?.endsAt && Date.now() >= localRoom.timer.endsAt) {
      finalizeDiscussion(localRoom);
      publishStateToAll();
      return;
    }
    if (localRoom.phase === "clue" && localRoom.timer?.endsAt && Date.now() >= localRoom.timer.endsAt) {
      advanceClueTurn(localRoom);
      publishStateToAll();
    }
  }, 250);
}

function resetRoomState() {
  clearAutoAdvanceTimer();
  localRoom = null;
  currentRoomCode = null;
  currentHostPeerId = null;
  currentPlayerId = null;
  currentPlayerNick = null;
  currentAvatar = null;
  currentToken = null;
  mode = "none";
  peerConnections.clear();
  relayBound = false;
  saveSession(null);
  saveHostRoom(null);
  setGameState({ room: null, self: null, peers: [], playerId: null });
}

function promoteHostIfNeeded() {
  if (!localRoom) return;
  const hostPlayer = localRoom.players.find((player) => player.id === localRoom?.hostId);
  if (hostPlayer?.connected !== false) return;
  const next = localRoom.players.filter((player) => player.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  if (!next) return;
  localRoom.hostId = next.id;
  next.host = true;
  localRoom.players.forEach((player) => {
    if (player.id !== next.id) player.host = false;
  });
}

function handleIncoming(msg: Outgoing, conn: Wire) {
  if (mode === "host") {
    if (msg.t === "createRoom") {
      // host-side rooms are created locally from the UI action, so ignore
      return;
    }
    if (msg.t === "joinRoom") {
      const roomCode = String(msg["code"] || "").trim();
      if (!localRoom || localRoom.code !== roomCode) return;
      const clientId = typeof msg["clientId"] === "string" && msg["clientId"] ? String(msg["clientId"]) : null;
      const from = (clientId || conn.peer || "").trim();
      if (!from) return;
      const token = typeof msg["token"] === "string" ? String(msg["token"]) : "";
      const nickname = String(msg["nickname"] || "Guest");
      const avatar = typeof msg["avatar"] === "string" ? msg["avatar"] : null;
      let player = localRoom.players.find((entry) => {
        if (clientId && entry.clientId === clientId) return true;
        if (token && `${localRoom!.code}-${entry.id}` === token) return true;
        if (entry.peerId === from) return true;
        return false;
      });
      if (player) {
        if (player.peerId !== from) {
          peerConnections.delete(player.peerId);
        }
        player.peerId = from;
        player.connected = true;
        player.nickname = nickname;
        if (avatar) player.avatar = avatar;
        if (clientId) player.clientId = clientId;
      } else if (localRoom.players.filter((entry) => entry.connected).length >= MAX_PLAYERS) {
        relayPublish(privatePath(roomCode, from), { t: "error", code: "room_full", message: "This room is full (30 kitties)." });
        return;
      } else {
        player = {
          id: generatePlayerId(),
          peerId: from,
          nickname,
          avatar,
          connected: true,
          host: false,
          ready: false,
          score: 0,
          roundScore: 0,
          voted: false,
          mic: true,
          speaker: true,
          speaking: false,
          eliminated: false,
          role: null,
          roleSeen: false,
          vote: null,
          viewing: null,
          joinedAt: Date.now(),
          clientId,
        };
        localRoom.players.push(player);
      }
      wireClient(from);
      if (!localRoom.hostId) {
        localRoom.hostId = player.id;
        player.host = true;
      }
      if (localRoom.phase === "lobby") {
        localRoom.takenAvatars = localRoom.players.map((entry) => entry.avatar).filter(Boolean) as string[];
      }
      const publicRoom = buildPublicRoom(localRoom);
      const privateState = buildPrivateState(localRoom, player.id);
      const sendTo = peerConnections.get(from)?.send;
      sendTo?.({ t: "session", playerId: player.id, token: `${roomCode}-${player.id}`, code: roomCode });
      sendTo?.({ t: "room", room: publicRoom });
      sendTo?.({ t: "private", private: privateState });
      sendTo?.({ t: "peers", peers: [...peerConnections.keys()].filter((peerId) => peerId !== from) });
      localRoom.takenAvatars = [...new Set(localRoom.players.map((entry) => entry.avatar).filter(Boolean) as string[])];
      publishStateToAll();
      return;
    }
    if (msg.t === "leaveRoom") {
      const player = localRoom?.players.find((entry) => entry.peerId === conn.peer);
      if (player) {
        player.connected = false;
        peerConnections.delete(conn.peer);
        promoteHostIfNeeded();
        publishStateToAll();
      }
      return;
    }
    const player =
      localRoom?.players.find((entry) => entry.peerId === conn.peer || entry.clientId === conn.peer) ??
      (mode === "host" && (conn.peer === getClientId() || conn.peer === currentPlayerId)
        ? localRoom?.players.find((entry) => entry.id === currentPlayerId)
        : undefined);
    if (!localRoom || !player) return;
    switch (msg.t) {
      case "selectAvatar":
        player.avatar = typeof msg["avatar"] === "string" ? msg["avatar"] : null;
        localRoom.takenAvatars = [...new Set(localRoom.players.map((entry) => entry.avatar).filter(Boolean) as string[])];
        publishStateToAll();
        break;
      case "updateSettings":
        if (player.id !== localRoom.hostId) return;
        const settingsPatch = msg["settings"] as Partial<RoomSettings>;
        if (settingsPatch) {
          if (typeof settingsPatch.rounds === "number") {
            localRoom.maxRounds = settingsPatch.rounds;
          }
          localRoom.settings = { ...localRoom.settings, ...settingsPatch };
        }
        publishStateToAll();
        break;
      case "startGame":
        if (player.id !== localRoom.hostId) return;
        if (localRoom.phase !== "lobby") return;
        const connectedPlayers = getOrderedPlayers(localRoom);
        if (connectedPlayers.length < 3) return;
        if (connectedPlayers.some((entry) => !entry.avatar)) return;
        if (localRoom.settings.imposters >= connectedPlayers.length - 1) return;
        localRoom.round = 1;
        localRoom.locked = true;
        localRoom.phase = "writer";
        localRoom.writerQueue = buildWriterOrder(localRoom, connectedPlayers);
        localRoom.writerId = localRoom.writerQueue.shift() ?? null;
        localRoom.currentSpeakerId = null;
        localRoom.takenAvatars = [...new Set(localRoom.players.map((entry) => entry.avatar).filter(Boolean) as string[])];
        localRoom.speakingOrder = [];
        localRoom.players.forEach((entry) => {
          entry.ready = false;
          entry.roleSeen = false;
          entry.voted = false;
          entry.vote = null;
          entry.role = null;
          entry.eliminated = false;
          entry.viewing = null;
        });
        publishStateToAll();
        break;
      case "submitWord":
        if (localRoom.phase !== "writer" || player.id !== localRoom.writerId) return;
        localRoom.secretWord = String(msg["word"] || "");
        localRoom.lastWriterId = localRoom.writerId;
        assignRoles(localRoom, localRoom.writerId);
        localRoom.speakingOrder = buildClueOrder(localRoom, getOrderedPlayers(localRoom));
        localRoom.phase = "roleReveal";
        setRoomTimer(localRoom, "roleReveal", null);
        publishStateToAll();
        break;
      case "roleSeen":
        if (localRoom.phase !== "roleReveal") return;
        player.roleSeen = true;
        publishStateToAll();
        break;
      case "continueToClue":
        if (localRoom.phase !== "roleReveal") return;
        if (!localRoom.players.every((entry) => entry.roleSeen || !entry.connected)) return;
        startCluePhase(localRoom);
        publishStateToAll();
        break;
      case "ready":
        if (localRoom.phase !== "roleReveal" && localRoom.phase !== "ready") return;
        player.roleSeen = true;
        player.ready = true;
        if (getConnectedPlayers(localRoom).every((entry) => entry.ready)) {
          startCluePhase(localRoom);
        }
        publishStateToAll();
        break;
      case "finishTurn":
      case "skipTurn":
        if (localRoom.phase === "clue") {
          advanceClueTurn(localRoom);
          const nextPhase = localRoom.phase as RoomState["phase"];
          if (nextPhase === "discussion") {
            startAutoAdvanceTimer();
          }
        }
        publishStateToAll();
        break;
      case "vote":
        if (localRoom.phase !== "discussion" && localRoom.phase !== "voting") return;
        if (player.voted) return;
        const targetId = String(msg["targetId"] || "");
        if (!targetId || targetId === player.id) return;
        const targetPlayer = localRoom.players.find((entry) => entry.id === targetId && entry.connected);
        if (!targetPlayer) return;
        player.vote = targetId;
        player.voted = true;
        localRoom.voted = localRoom.players.filter((entry) => entry.voted && entry.connected).map((entry) => entry.id);
        if (localRoom.players.filter((entry) => entry.connected).every((entry) => entry.voted)) {
          finalizeDiscussion(localRoom);
        }
        publishStateToAll();
        break;
      case "continueResult":
        if (localRoom.phase === "result") {
          player.viewing = "scoreboard";
        }
        publishStateToAll();
        break;
      case "viewing":
        if (!(["result", "scoreboard", null] as const).includes(msg["viewing"] as any)) return;
        player.viewing = msg["viewing"] as "result" | "scoreboard" | null;
        publishStateToAll();
        break;
      case "nextRound":
        if (player.id !== localRoom.hostId) return;
        if (localRoom.round >= localRoom.maxRounds) {
          localRoom.finished = true;
          localRoom.phase = "winner";
          localRoom.currentSpeakerId = null;
          localRoom.locked = true;
          publishStateToAll();
          break;
        }
        localRoom.round += 1;
        const nextPlayers = getOrderedPlayers(localRoom);
        localRoom.phase = "writer";
        localRoom.currentSpeakerId = null;
        localRoom.speakingOrder = [];
        if (!localRoom.writerQueue.length) {
          localRoom.writerQueue = buildWriterOrder(localRoom, nextPlayers);
        }
        localRoom.writerId = localRoom.writerQueue.shift() ?? null;
        localRoom.secretWord = null;
        localRoom.revealedWord = null;
        localRoom.voted = [];
        localRoom.result = null;
        localRoom.players.forEach((entry) => {
          entry.ready = false;
          entry.roleSeen = false;
          entry.voted = false;
          entry.vote = null;
          entry.role = null;
          entry.eliminated = false;
          entry.viewing = null;
          entry.roundScore = 0;
        });
        publishStateToAll();
        break;
      case "finishMatch":
        if (player.id !== localRoom.hostId) return;
        localRoom.finished = true;
        localRoom.phase = "winner";
        publishStateToAll();
        break;
      case "playAgain":
        if (player.id !== localRoom.hostId) return;
        clearAutoAdvanceTimer();
        localRoom.phase = "lobby";
        localRoom.round = 0;
        localRoom.result = null;
        localRoom.revealedWord = null;
        localRoom.secretWord = null;
        localRoom.writerId = null;
        localRoom.writerQueue = [];
        localRoom.lastWriterId = null;
        localRoom.currentSpeakerId = null;
        localRoom.voted = [];
        localRoom.players.forEach((entry) => {
          entry.ready = false;
          entry.roleSeen = false;
          entry.voted = false;
          entry.vote = null;
          entry.role = null;
          entry.eliminated = false;
        });
        publishStateToAll();
        break;
      case "returnLobby":
        if (player.id !== localRoom.hostId) return;
        localRoom.phase = "lobby";
        publishStateToAll();
        break;
      case "voiceState":
        player.mic = Boolean(msg["mic"]);
        player.speaker = Boolean(msg["speaker"]);
        publishStateToAll();
        break;
      case "rtc":
        if (typeof msg["to"] === "string") {
          const target = localRoom.players.find((entry) => entry.id === msg["to"]);
          if (target) {
            const targetConn = peerConnections.get(target.peerId);
            targetConn?.send({ t: "rtc", from: player.peerId, signal: msg["signal"] });
          }
        }
        break;
      case "rtc-close":
        if (typeof msg["to"] === "string") {
          const target = localRoom.players.find((entry) => entry.id === msg["to"]);
          if (target) {
            const targetConn = peerConnections.get(target.peerId);
            targetConn?.send({ t: "rtc-close", from: player.peerId });
          }
        }
        break;
      default:
        break;
    }
    return;
  }

  if (mode === "guest") {
    if (msg.t === "session") {
      currentPlayerId = String(msg["playerId"] || currentPlayerId);
      currentToken = String(msg["token"] || currentToken);
      persistSession();
      setGameState({ playerId: currentPlayerId });
      return;
    }
    if (msg.t === "room") {
      setGameState({ room: msg["room"] as RoomState });
      return;
    }
    if (msg.t === "private") {
      setGameState({ self: msg["private"] as PrivateState });
      return;
    }
    if (msg.t === "peers") {
      setGameState({ peers: msg["peers"] as string[] });
      return;
    }
    if (msg.t === "rtc") {
      signalHandler?.(String(msg["from"] || ""), msg["signal"]);
      return;
    }
    if (msg.t === "rtc-close") {
      closeHandler?.(String(msg["from"] || ""));
      return;
    }
    if (msg.t === "celebrate") {
      setGameState({ celebrateAt: Date.now() });
      return;
    }
    if (msg.t === "error") {
      setGameState({ lastError: { code: String(msg["code"] || ""), message: String(msg["message"] || "") } });
      return;
    }
  }
}

export function onVoiceSignal(handler: SignalHandler | null) {
  signalHandler = handler;
}

export function onVoiceClose(handler: ((from: string) => void) | null) {
  closeHandler = handler;
}

function clearJoinRetry() {
  if (joinRetryTimer) {
    clearTimeout(joinRetryTimer);
    joinRetryTimer = null;
  }
}

function destroyPeer() {
  clearJoinRetry();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  relayBound = false;
  disconnectRelay();
}

function scheduleFullReconnect() {
  if (intentionalClose) return;
  if (reconnectTimer) return;
  setGameState({ status: "reconnecting" });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (intentionalClose) return;
    destroyPeer();
    void connect();
  }, 1200);
}

export function connect(_hostPeerIdOverride?: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (mode !== "host" && mode !== "guest") return Promise.resolve();
  if (!currentRoomCode) return Promise.resolve();
  if (isRelayReady() && relayBound) {
    if (mode === "guest") flushQueuedMessages();
    return Promise.resolve();
  }

  intentionalClose = false;
  setGameState({ status: "connecting" });
  return connectRelay({
    clientId: getClientId(),
    code: currentRoomCode,
    role: mode,
    onMessage: (msg) => {
      if (mode === "host") {
        const from = String(msg["clientId"] || msg["peer"] || "");
        handleIncoming(msg, { peer: from });
        return;
      }
      handleIncoming(msg, { peer: "host" });
    },
  })
    .then(() => {
      relayBound = true;
      setGameState({ status: "online", lastError: null, playerId: currentPlayerId });
      if (mode === "host" && localRoom) {
        const hostPlayer = localRoom.players.find((entry) => entry.id === currentPlayerId);
        if (hostPlayer) {
          hostPlayer.peerId = getClientId();
          hostPlayer.clientId = getClientId();
        }
        persistSession();
        publishStateToAll();
      }
      if (mode === "guest") flushQueuedMessages();
    })
    .catch((error) => {
      console.error("Room relay failed", error);
      scheduleFullReconnect();
    });
}

function queueJoinOnce() {
  queue = queue.filter((entry) => entry.t !== "joinRoom");
  queue.push({
    t: "joinRoom",
    code: currentRoomCode,
    nickname: currentPlayerNick,
    avatar: currentAvatar,
    clientId: getClientId(),
    token: currentToken,
  });
}

function scheduleJoinRetry() {
  clearJoinRetry();
  joinRetryTimer = setTimeout(() => {
    if (mode !== "guest") return;
    queueJoinOnce();
    if (isRelayReady()) flushQueuedMessages();
    else void connect();
  }, 900);
}

export function send(msg: Outgoing) {
  if (msg.t === "createRoom") {
    const roomCode = generateRoomCode();
    currentRoomCode = roomCode;
    currentHostPeerId = hostPeerId(roomCode);
    currentPlayerId = generatePlayerId();
    currentPlayerNick = String(msg["nickname"] || "Guest");
    currentAvatar = typeof msg["avatar"] === "string" ? msg["avatar"] : null;
    localRoom = createDefaultRoom(roomCode);
    const initialSettings = msg["settings"] as Partial<RoomSettings> | undefined;
    if (initialSettings) {
      if (typeof initialSettings.rounds === "number") {
        localRoom.maxRounds = initialSettings.rounds;
      }
      localRoom.settings = { ...localRoom.settings, ...initialSettings };
    }
    localRoom.hostId = currentPlayerId;
    localRoom.players.push({
      id: currentPlayerId,
      peerId: getClientId(),
      nickname: currentPlayerNick,
      avatar: currentAvatar,
      connected: true,
      host: true,
      ready: false,
      score: 0,
      roundScore: 0,
      voted: false,
      mic: true,
      speaker: true,
      speaking: false,
      eliminated: false,
      role: null,
      roleSeen: false,
      vote: null,
      viewing: null,
      joinedAt: Date.now(),
      clientId: getClientId(),
    });
    mode = "host";
    persistSession();
    setGameState({ playerId: currentPlayerId, room: buildPublicRoom(localRoom), self: buildPrivateState(localRoom, currentPlayerId), peers: [] });
    void connect();
    return;
  }

  if (msg.t === "joinRoom") {
    if (getGameState().room && currentRoomCode === String(msg["code"] || "")) {
      return;
    }
    mode = "guest";
    currentRoomCode = String(msg["code"] || "");
    const requestedHost = typeof msg["hostPeerId"] === "string" ? String(msg["hostPeerId"]).trim() : "";
    currentHostPeerId = requestedHost || hostPeerId(currentRoomCode);
    currentPlayerNick = String(msg["nickname"] || "Guest");
    currentAvatar = typeof msg["avatar"] === "string" ? msg["avatar"] : null;
    persistSession();
    queueJoinOnce();
    void connect();
    return;
  }

  if (mode === "host") {
    if (msg.t === "leaveRoom") {
      resetRoomState();
      disconnectRelay();
      return;
    }
    if (localRoom && currentPlayerId) {
      const localPlayer = localRoom.players.find((entry) => entry.id === currentPlayerId);
      if (localPlayer) {
        handleIncoming(msg, { peer: getClientId() });
      }
    }
    return;
  }

  if (msg.t === "leaveRoom") {
    if (currentRoomCode) relayPublish(inboxPath(currentRoomCode), { ...msg, clientId: getClientId() });
    resetRoomState();
    disconnectRelay();
    return;
  }

  queue.push({ ...msg, clientId: getClientId() });
  if (isRelayReady()) flushQueuedMessages();
  else void connect();
}

export function disconnect() {
  intentionalClose = true;
  saveSession(null);
  queue = [];
  destroyPeer();
  peerConnections.clear();
  resetRoomState();
}

export function resumeIfPossible() {
  if (typeof window === "undefined") return false;
  const session = loadSession();
  if (!session?.code) return false;
  currentRoomCode = session.code;
  currentPlayerId = session.playerId;
  currentToken = session.token;
  currentPlayerNick = session.nickname;
  currentAvatar = session.avatar;
  currentHostPeerId = session.hostPeerId || hostPeerId(session.code);
  if (session.mode === "host") {
    const saved = loadHostRoom<{ playerId: string; room: HostRoom }>();
    if (!saved?.room) return false;
    localRoom = saved.room;
    currentPlayerId = saved.playerId || session.playerId;
    localRoom.players.forEach((player) => {
      if (player.id !== currentPlayerId) player.connected = false;
      else {
        player.connected = true;
        player.peerId = getClientId();
        player.clientId = getClientId();
      }
      if (player.clientId) wireClient(player.clientId);
    });
    mode = "host";
    persistSession();
    setGameState({
      status: "connecting",
      playerId: currentPlayerId,
      room: buildPublicRoom(localRoom),
      self: buildPrivateState(localRoom, currentPlayerId),
      peers: [],
    });
    if (localRoom.phase === "clue" || localRoom.phase === "discussion") startAutoAdvanceTimer();
    void connect();
    return true;
  }
  mode = "guest";
  setGameState({ status: "reconnecting", playerId: currentPlayerId });
  queueJoinOnce();
  void connect();
  return true;
}

export function clearError() {
  setGameState({ lastError: null });
}

/* ---- actions: the only way the UI talks to the game ---- */
export const actions = {
  createRoom: (nickname: string, avatar: string | null, settings: Partial<RoomSettings>) =>
    send({ t: "createRoom", nickname, avatar, settings }),
  joinRoom: (code: string, nickname: string, avatar: string | null, hostPeerId?: string | null) =>
    send({ t: "joinRoom", code, nickname, avatar, hostPeerId: hostPeerId || undefined }),
  selectAvatar: (avatar: string) => send({ t: "selectAvatar", avatar }),
  updateSettings: (settings: Partial<RoomSettings>) => send({ t: "updateSettings", settings }),
  startGame: () => send({ t: "startGame" }),
  submitWord: (word: string) => send({ t: "submitWord", word }),
  roleSeen: () => send({ t: "roleSeen" }),
  continueToClue: () => send({ t: "continueToClue" }),
  ready: () => send({ t: "ready" }),
  finishTurn: () => send({ t: "finishTurn" }),
  skipTurn: () => send({ t: "skipTurn" }),
  skipDiscussion: () => send({ t: "skipDiscussion" }),
  vote: (targetId: string) => send({ t: "vote", targetId }),
  continueResult: () => send({ t: "continueResult" }),
  nextRound: () => send({ t: "nextRound" }),
  finishMatch: () => send({ t: "finishMatch" }),
  playAgain: (keepScores = false) => send({ t: "playAgain", keepScores }),
  returnLobby: () => send({ t: "returnLobby" }),
  viewing: (viewing: "result" | "scoreboard" | null) => send({ t: "viewing", viewing }),
  voiceState: (mic: boolean, speaker: boolean) => send({ t: "voiceState", mic, speaker }),
  rtc: (to: string, signal: unknown) => send({ t: "rtc", to, signal }),
  leaveRoom: () => {
    send({ t: "leaveRoom" });
    saveSession(null);
  },
};