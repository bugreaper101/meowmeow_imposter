// Only user preferences are persisted. Never room state, roles, votes or words.
export type Prefs = {
  nickname: string;
  avatar: string | null;
  language: string;
  micEnabled: boolean;
  speakerEnabled: boolean;
  soundVolume: number;
  musicVolume: number;
  reducedMotion: boolean;
};

const KEY = "meowmeow.prefs.v1";

export const defaultPrefs: Prefs = {
  nickname: "",
  avatar: null,
  language: "en-US",
  micEnabled: true,
  speakerEnabled: true,
  soundVolume: 0.8,
  musicVolume: 0.5,
  reducedMotion: false,
};

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return defaultPrefs;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultPrefs;
    return { ...defaultPrefs, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadPrefs(), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode) — preferences just won't persist */
  }
}

const SESSION_KEY = "meowmeow.session.v2";
const CLIENT_KEY = "meowmeow.clientId.v1";
const HOST_ROOM_KEY = "meowmeow.hostRoom.v1";

export type GameSession = {
  mode: "host" | "guest";
  code: string;
  playerId: string;
  token: string;
  nickname: string;
  avatar: string | null;
  hostPeerId?: string | null;
};

export function getClientId(): string {
  if (typeof window === "undefined") return "c_ssr";
  try {
    const existing = window.localStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const id = `c_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return `c_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function saveSession(session: GameSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session) {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem("meowmeow.session.v1");
    } else {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    /* ignore */
  }
}

export function loadSession(): GameSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as GameSession) : null;
  } catch {
    return null;
  }
}

export function saveHostRoom(payload: unknown | null) {
  if (typeof window === "undefined") return;
  try {
    if (!payload) window.localStorage.removeItem(HOST_ROOM_KEY);
    else window.localStorage.setItem(HOST_ROOM_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadHostRoom<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOST_ROOM_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}