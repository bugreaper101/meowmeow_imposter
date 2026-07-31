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

// Session-scoped reconnect handle. Cleared when the tab closes.
const SESSION_KEY = "meowmeow.session.v1";

export function saveSession(session: { code: string; token: string } | null) {
  if (typeof window === "undefined") return;
  try {
    if (!session) window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function loadSession(): { code: string; token: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as { code: string; token: string }) : null;
  } catch {
    return null;
  }
}