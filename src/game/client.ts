import Peer, { type DataConnection } from "peerjs";
import type { PrivateState, PublicPlayer, RoomSettings, RoomState, ServerMessage, Role } from "./protocol";
import { getGameState, resetGameState, setGameState } from "./store";
import { loadSession, saveSession } from "./prefs";

type Outgoing = Record<string, unknown> & { t: string };
type SignalHandler = (from: string, signal: unknown) => void;

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
  joinedAt: number;
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

let peer: Peer | null = null;
let hostConnection: DataConnection | null = null;
let queue: Outgoing[] = [];
let intentionalClose = false;
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
let peerConnections = new Map<string, DataConnection>();

function flushQueuedMessages() {
  if (!hostConnection || !hostConnection.open) return;
  const pending = queue;
  queue = [];
  for (const msg of pending) {
    try {
      hostConnection.send(msg);
    } catch {
      queue.push(msg);
    }
  }
}

function generateRoomCode() {
  return `${Math.floor(10000 + Math.random() * 90000)}`;
}

function generatePlayerId() {
  return `p_${Math.random().toString(36).slice(2, 8)}`;
}

function hostPeerId(code: string) {
  return `${code.trim().toUpperCase()}-host`;
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
    takenAvatars: [...room.takenAvatars],
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
    })),
  };
}

function buildPrivateState(room: HostRoom, playerId: string): PrivateState {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) {
    return { playerId, role: null, secretWord: null, isWriter: false, isHost: false, roleSeen: false, ready: false, vote: null };
  }
  const canSeeWord = player.role === "player" || player.role === "writer";
  return {
    playerId,
    role: player.role,
    secretWord: canSeeWord ? room.secretWord : null,
    isWriter: room.writerId === player.id,
    isHost: room.hostId === player.id,
    roleSeen: player.roleSeen,
    ready: player.ready,
    vote: player.vote,
  };
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

function publishStateToAll() {
  if (!localRoom) return;
  publishRoom(localRoom);
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

function resetRoomState() {
  localRoom = null;
  currentRoomCode = null;
  currentHostPeerId = null;
  currentPlayerId = null;
  currentPlayerNick = null;
  currentAvatar = null;
  currentToken = null;
  mode = "none";
  peerConnections.clear();
  hostConnection = null;
  setGameState({ room: null, self: null, peers: [], playerId: null });
}

function bindPeerEvents(conn: DataConnection) {
  conn.on("open", () => {
    if (mode === "guest" && hostConnection?.peer === conn.peer) {
      flushQueuedMessages();
    }
  });
  conn.on("data", (data) => {
    const msg = data as Outgoing;
    if (!msg || typeof msg.t !== "string") return;
    handleIncoming(msg, conn);
  });
  conn.on("close", () => {
    if (mode === "host") {
      const disconnectingPlayer = localRoom?.players.find((player) => player.peerId === conn.peer);
      if (disconnectingPlayer) {
        disconnectingPlayer.connected = false;
        peerConnections.delete(conn.peer);
        promoteHostIfNeeded();
        publishStateToAll();
      }
    }
    if (hostConnection?.peer === conn.peer) {
      hostConnection = null;
      if (mode === "guest") {
        setGameState({ status: "reconnecting" });
      }
    }
    peerConnections.delete(conn.peer);
  });
  conn.on("error", () => {
    if (hostConnection?.peer === conn.peer) hostConnection = null;
    peerConnections.delete(conn.peer);
  });
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

function handleIncoming(msg: Outgoing, conn: DataConnection) {
  if (mode === "host") {
    if (msg.t === "createRoom") {
      // host-side rooms are created locally from the UI action, so ignore
      return;
    }
    if (msg.t === "joinRoom") {
      const roomCode = String(msg["code"] || "").trim();
      if (!localRoom || localRoom.code !== roomCode) return;
      const playerId = generatePlayerId();
      const player: PlayerRecord = {
        id: playerId,
        peerId: conn.peer,
        nickname: String(msg["nickname"] || "Guest"),
        avatar: typeof msg["avatar"] === "string" ? msg["avatar"] : null,
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
        joinedAt: Date.now(),
      };
      localRoom.players.push(player);
      peerConnections.set(conn.peer, conn);
      if (!localRoom.hostId) {
        localRoom.hostId = player.id;
        player.host = true;
      }
      if (localRoom.phase === "lobby") {
        localRoom.takenAvatars = localRoom.players.map((entry) => entry.avatar).filter(Boolean) as string[];
      }
      const publicRoom = buildPublicRoom(localRoom);
      const privateState = buildPrivateState(localRoom, player.id);
      try {
        conn.send({ t: "session", playerId, token: `${roomCode}-${playerId}`, code: roomCode });
        conn.send({ t: "room", room: publicRoom });
        conn.send({ t: "private", private: privateState });
        conn.send({ t: "peers", peers: [...peerConnections.keys()].filter((peerId) => peerId !== conn.peer) });
      } catch {
        // ignore send issues
      }
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
    const player = localRoom?.players.find((entry) => entry.peerId === conn.peer);
    if (!localRoom || !player) return;
    switch (msg.t) {
      case "selectAvatar":
        player.avatar = typeof msg["avatar"] === "string" ? msg["avatar"] : null;
        publishStateToAll();
        break;
      case "updateSettings":
        if (player.id !== localRoom.hostId) return;
        localRoom.settings = { ...localRoom.settings, ...(msg["settings"] as Partial<RoomSettings>) };
        publishStateToAll();
        break;
      case "startGame":
        if (player.id !== localRoom.hostId) return;
        if (localRoom.phase !== "lobby") return;
        localRoom.phase = "writer";
        localRoom.writerId = localRoom.players.find((entry) => entry.connected)?.id ?? null;
        localRoom.currentSpeakerId = null;
        publishStateToAll();
        break;
      case "submitWord":
        if (localRoom.phase !== "writer" || player.id !== localRoom.writerId) return;
        localRoom.secretWord = String(msg["word"] || "");
        localRoom.phase = "roleReveal";
        publishStateToAll();
        break;
      case "roleSeen":
        if (localRoom.phase !== "roleReveal") return;
        player.roleSeen = true;
        if (localRoom.players.every((entry) => entry.roleSeen || !entry.connected)) {
          localRoom.phase = "ready";
        }
        publishStateToAll();
        break;
      case "ready":
        if (localRoom.phase !== "ready") return;
        player.ready = true;
        if (localRoom.players.every((entry) => entry.ready || !entry.connected)) {
          localRoom.phase = "clue";
          localRoom.currentSpeakerId = localRoom.speakingOrder[0] ?? localRoom.players.find((entry) => entry.connected)?.id ?? null;
        }
        publishStateToAll();
        break;
      case "finishTurn":
      case "skipTurn":
        if (localRoom.phase === "clue") {
          localRoom.phase = "discussion";
        }
        publishStateToAll();
        break;
      case "skipDiscussion":
        if (localRoom.phase === "discussion") {
          localRoom.phase = "voting";
        }
        publishStateToAll();
        break;
      case "vote":
        if (localRoom.phase !== "voting") return;
        player.vote = String(msg["targetId"] || "");
        player.voted = true;
        localRoom.voted = localRoom.players.filter((entry) => entry.voted && entry.connected).map((entry) => entry.id);
        if (localRoom.voted.length === localRoom.players.filter((entry) => entry.connected).length) {
          localRoom.phase = "result";
          localRoom.result = { eliminatedId: null, eliminatedRole: null, tie: false, counts: {}, winner: "innocents", secretWord: localRoom.secretWord, points: 20 };
        }
        publishStateToAll();
        break;
      case "continueResult":
        if (localRoom.phase === "result") {
          localRoom.phase = "scoreboard";
        }
        publishStateToAll();
        break;
      case "nextRound":
        if (player.id !== localRoom.hostId) return;
        localRoom.round += 1;
        localRoom.phase = "lobby";
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
        localRoom.phase = "lobby";
        localRoom.round = 0;
        localRoom.result = null;
        localRoom.revealedWord = null;
        localRoom.secretWord = null;
        localRoom.writerId = null;
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
      saveSession({ code: String(msg["code"] || currentRoomCode || ""), token: String(msg["token"] || currentToken || "") });
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

export function connect(hostPeerIdOverride?: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const hostId = hostPeerIdOverride ?? currentHostPeerId;
  const shouldRecreateHostPeer = Boolean(peer && hostId && mode === "host" && peer.id !== hostId);
  if (shouldRecreateHostPeer) {
    peer?.destroy();
    peer = null;
    hostConnection = null;
  }
  if (peer) {
    if (hostId && mode === "guest" && !hostConnection?.open) {
      connectToHost(hostId);
    }
    return Promise.resolve();
  }
  intentionalClose = false;
  setGameState({ status: "connecting" });
  return new Promise((resolve) => {
    try {
      const peerOptions = {
        host: "0.peerjs.com",
        port: 443,
        path: "/",
        secure: true,
        debug: 0,
      };
      if (mode === "guest") {
        peer = new Peer({ ...peerOptions });
      } else {
        peer = new Peer(String(hostId ?? ""), peerOptions);
      }
    } catch (error) {
      console.error("PeerJS init failed", error);
      setGameState({ status: "offline" });
      resolve();
      return;
    }

    peer.on("open", (id) => {
      currentPlayerId = currentPlayerId ?? id;
      setGameState({ status: "online", lastError: null, playerId: currentPlayerId });
      if (hostId && mode === "guest" && !hostConnection?.open) {
        connectToHost(hostId);
      }
      if (hostConnection?.open) {
        flushQueuedMessages();
      }
      resolve();
    });

    peer.on("connection", (conn) => {
      bindPeerEvents(conn);
      if (mode === "host") {
        peerConnections.set(conn.peer, conn);
      }
    });

    peer.on("error", (error) => {
      console.error("PeerJS error", error);
      setGameState({ status: "offline" });
    });
  });
}

function connectToHost(hostId: string) {
  if (!peer || hostConnection?.open) return;
  const conn = peer.connect(hostId, { reliable: true });
  hostConnection = conn;
  bindPeerEvents(conn);
  if (conn.open) {
    flushQueuedMessages();
  }
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
    localRoom.hostId = currentPlayerId;
    localRoom.players.push({
      id: currentPlayerId,
      peerId: peer?.id ?? currentPlayerId,
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
      joinedAt: Date.now(),
    });
    mode = "host";
    saveSession({ code: roomCode, token: `${roomCode}-${currentPlayerId}` });
    setGameState({ playerId: currentPlayerId, room: buildPublicRoom(localRoom), self: buildPrivateState(localRoom, currentPlayerId), peers: [] });
    void connect(currentHostPeerId);
    return;
  }

  if (msg.t === "joinRoom") {
    mode = "guest";
    currentRoomCode = String(msg["code"] || "");
    currentHostPeerId = hostPeerId(currentRoomCode);
    currentPlayerNick = String(msg["nickname"] || "Guest");
    currentAvatar = typeof msg["avatar"] === "string" ? msg["avatar"] : null;
    queue.push(msg);
    void connect(currentHostPeerId);
    return;
  }

  if (mode === "host") {
    if (msg.t === "leaveRoom") {
      resetRoomState();
      return;
    }
    if (localRoom && currentPlayerId) {
      const localPlayer = localRoom.players.find((entry) => entry.id === currentPlayerId);
      if (localPlayer) {
        handleIncoming(msg, { peer: peer?.id ?? currentPlayerId, send: () => undefined } as unknown as DataConnection);
      }
    }
    return;
  }

  if (hostConnection?.open) {
    hostConnection.send(msg);
    return;
  }

  queue.push(msg);
  if (currentHostPeerId) {
    if (!peer || !peer.open) {
      void connect(currentHostPeerId);
      return;
    }
    connectToHost(currentHostPeerId);
  }
}

export function disconnect() {
  intentionalClose = true;
  saveSession(null);
  queue = [];
  hostConnection?.close();
  hostConnection = null;
  peer?.destroy();
  peer = null;
  peerConnections.clear();
  resetRoomState();
}

export function clearError() {
  setGameState({ lastError: null });
}

/* ---- actions: the only way the UI talks to the game ---- */
export const actions = {
  createRoom: (nickname: string, avatar: string | null, settings: Partial<RoomSettings>) =>
    send({ t: "createRoom", nickname, avatar, settings }),
  joinRoom: (code: string, nickname: string, avatar: string | null) => send({ t: "joinRoom", code, nickname, avatar }),
  selectAvatar: (avatar: string) => send({ t: "selectAvatar", avatar }),
  updateSettings: (settings: Partial<RoomSettings>) => send({ t: "updateSettings", settings }),
  startGame: () => send({ t: "startGame" }),
  submitWord: (word: string) => send({ t: "submitWord", word }),
  roleSeen: () => send({ t: "roleSeen" }),
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
  voiceState: (mic: boolean, speaker: boolean) => send({ t: "voiceState", mic, speaker }),
  rtc: (to: string, signal: unknown) => send({ t: "rtc", to, signal }),
  leaveRoom: () => {
    send({ t: "leaveRoom" });
    saveSession(null);
  },
};