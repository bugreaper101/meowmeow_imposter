import { loadSession, saveSession } from "./prefs";
import type { ServerMessage } from "./protocol";
import { getGameState, setGameState } from "./store";

type SignalHandler = (from: string, signal: unknown) => void;

let signalHandler: SignalHandler | null = null;
let closeHandler: ((from: string) => void) | null = null;

export function onVoiceSignal(handler: SignalHandler | null) {
  signalHandler = handler;
}

export function onVoiceClose(handler: ((from: string) => void) | null) {
  closeHandler = handler;
}

export function handleServerMessage(msg: ServerMessage) {
  switch (msg.t) {
    case "session":
      saveSession({ code: msg.code, token: msg.token });
      setGameState({ playerId: msg.playerId });
      break;
    case "room":
      setGameState({ room: msg.room });
      break;
    case "private":
      setGameState({ self: msg.private });
      break;
    case "peers":
      setGameState({ peers: msg.peers });
      break;
    case "rtc":
      signalHandler?.(msg.from, msg.signal);
      break;
    case "rtc-close":
      closeHandler?.(msg.from);
      break;
    case "celebrate":
      setGameState({ celebrateAt: Date.now() });
      break;
    case "error":
      setGameState({ lastError: { code: msg.code, message: msg.message } });
      break;
    default:
      break;
  }
}

export function hydrateSessionFromStore() {
  const stored = loadSession();
  if (stored && !getGameState().room) {
    return { t: "resume", ...stored } as const;
  }
  return null;
}
