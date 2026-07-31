import Peer, { type DataConnection, type MediaConnection } from "peerjs";
import { saveSession, loadSession } from "./prefs";
import type { RoomSettings, ServerMessage } from "./protocol";
import { getGameState, resetGameState, setGameState } from "./store";
import { handleServerMessage, hydrateSessionFromStore } from "./messageBridge";

const ROOM_PREFIX = "mallow-room";
const PEER_SERVER = "0.peerjs.com";
const PEER_PATH = "mallow";

type Outgoing = Record<string, unknown> & { t: string };

interface RoomSession {
  code: string;
  hostId: string;
  participants: Map<string, DataConnection>;
  media: Map<string, MediaConnection>;
  state: ServerMessage[];
}

const sessions = new Map<string, RoomSession>();
const peersById = new Map<string, DataConnection>();
const mediaById = new Map<string, MediaConnection>();
let peer: Peer | null = null;
let socket: DataConnection | null = null;
let queue: Outgoing[] = [];
let intentionalClose = false;
let currentRoomCode: string | null = null;
let currentPlayerId: string | null = null;
let localHost = false;

function makeRoomCode(code?: string) {
  return `${ROOM_PREFIX}-${(code || "").toUpperCase()}`;
}

function createSession(code: string, hostId: string): RoomSession {
  const session: RoomSession = { code, hostId, participants: new Map(), media: new Map(), state: [] };
  sessions.set(code, session);
  return session;
}

function getSession(code: string) {
  return sessions.get(code);
}

function broadcastToRoom(session: RoomSession, msg: ServerMessage) {
  for (const conn of session.participants.values()) {
    try {
      conn.send(msg);
    } catch {
      // ignore disconnect races
    }
  }
}

function applyHostAction(msg: Outgoing) {
  const code = currentRoomCode;
  if (!code) return;
  const session = getSession(code);
  if (!session) return;
  const payload = msg as ServerMessage;
  if (msg.t === "createRoom" || msg.t === "joinRoom" || msg.t === "resume") {
    const roomCode = String(msg.t === "joinRoom" ? msg.code : msg.t === "resume" ? msg.code : "").trim();
    const sessionCode = roomCode || code;
    if (msg.t === "createRoom") {
      const newSession = createSession(sessionCode, currentPlayerId || "host");
      const hostId = currentPlayerId || "host";
      currentRoomCode = sessionCode;
      localHost = true;
      setGameState({ status: "online" });
      const roomState = {
        code: sessionCode,
        phase: "lobby",
        round: 0,
        maxRounds: 10,
        hostId,
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
        players: [],
      };
      const privateState = { playerId: hostId, role: null, secretWord: null, isWriter: false, isHost: true, roleSeen: false, ready: false, vote: null };
      setGameState({ room: roomState, self: privateState, peers: [] });
      saveSession({ code: sessionCode, token: "host" });
      setGameState({ playerId: hostId });
      return;
    }
    if (msg.t === "joinRoom") {
      const joinSession = getSession(sessionCode);
      if (!joinSession) {
        setGameState({ lastError: { code: "room_not_found", message: "We couldn't find that room." } });
        return;
      }
      const hostId = joinSession.hostId;
      currentRoomCode = sessionCode;
      localHost = false;
      setGameState({ status: "online" });
      setGameState({ room: null, self: null, peers: [] });
      saveSession({ code: sessionCode, token: "guest" });
      setGameState({ playerId: currentPlayerId || `guest-${Math.random().toString(36).slice(2, 8)}` });
      return;
    }
    if (msg.t === "resume") {
      currentRoomCode = sessionCode;
      setGameState({ status: "online" });
      return;
    }
  }

  if (msg.t === "leaveRoom") {
    if (socket) {
      try {
        socket.close();
      } catch {
        // noop
      }
      socket = null;
    }
    if (currentRoomCode) {
      const session = getSession(currentRoomCode);
      if (session) {
        session.participants.delete(currentPlayerId || "");
        session.media.delete(currentPlayerId || "");
      }
    }
    currentRoomCode = null;
    currentPlayerId = null;
    localHost = false;
    resetGameState();
    setGameState({ status: "idle" });
    return;
  }

  if (!session || !socket) return;

  const envelope: ServerMessage = { t: msg.t as string } as ServerMessage;
  const message = JSON.stringify(envelope);
  try {
    socket.send(message);
  } catch {
    // ignore send errors
  }
}

export function connect(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (peer) return Promise.resolve();
  intentionalClose = false;
  setGameState({ status: "connecting" });
  return new Promise((resolve) => {
    try {
      peer = new Peer({ host: PEER_SERVER, port: 443, path: PEER_PATH, secure: true, debug: 0 });
    } catch {
      setGameState({ status: "offline" });
      resolve();
      return;
    }

    peer.on("open", (id) => {
      currentPlayerId = id;
      setGameState({ status: "online", lastError: null });
      const hydrated = hydrateSessionFromStore();
      if (hydrated) processIncoming(hydrated);
      const pending = queue;
      queue = [];
      for (const msg of pending) processIncoming(msg);
      resolve();
    });

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        const code = conn.metadata?.code as string | undefined;
        const session = code ? getSession(code) : null;
        if (!session) {
          conn.close();
          return;
        }
        session.participants.set(conn.peer, conn);
        peersById.set(conn.peer, conn);
        if (session.hostId === conn.peer) {
          // host connection is tracked but not used for gameplay here
        }
        conn.on("data", (data) => {
          const message = data as ServerMessage;
          handleServerMessage(message);
        });
      });
    });

    peer.on("error", () => {
      setGameState({ status: "offline" });
    });
  });
}

export function send(msg: Outgoing) {
  if (!peer) {
    queue.push(msg);
    void connect();
    return;
  }
  processIncoming(msg);
}

export function disconnect() {
  intentionalClose = true;
  saveSession(null);
  queue = [];
  if (socket) {
    try {
      socket.close();
    } catch {
      // noop
    }
  }
  socket = null;
  if (peer) {
    try {
      peer.destroy();
    } catch {
      // noop
    }
  }
  peer = null;
  resetGameState();
}

export function clearError() {
  setGameState({ lastError: null });
}

function processIncoming(msg: Outgoing) {
  if (msg.t === "createRoom" || msg.t === "joinRoom") {
    applyHostAction(msg);
    return;
  }
  if (msg.t === "leaveRoom") {
    applyHostAction(msg);
    return;
  }
  if (msg.t === "resume") {
    applyHostAction(msg);
    return;
  }
  const code = currentRoomCode;
  if (!code) return;
  const session = getSession(code);
  if (!session) return;
  const payload = msg as ServerMessage;
  const envelope: ServerMessage = { ...payload };
  if (msg.t === "voiceState") {
    const state = envelope as unknown as ServerMessage;
    handleServerMessage({ t: "room", room: getGameState().room as any });
    broadcastToRoom(session, state);
    return;
  }
  if (msg.t === "rtc") {
    const target = msg.to as string;
    const targetConnection = session.participants.get(target);
    if (targetConnection) {
      targetConnection.send({ t: "rtc", from: currentPlayerId, signal: msg.signal });
    }
    return;
  }
  if (msg.t === "rtc-close") {
    const target = msg.to as string;
    const targetConnection = session.participants.get(target);
    if (targetConnection) {
      targetConnection.send({ t: "rtc-close", from: currentPlayerId });
    }
    return;
  }
  if (msg.t === "voiceState") {
    broadcastToRoom(session, envelope);
    return;
  }
  broadcastToRoom(session, envelope);
}

export const actions = {
  createRoom: (nickname: string, avatar: string | null, settings: Partial<RoomSettings>) => send({ t: "createRoom", nickname, avatar, settings }),
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
