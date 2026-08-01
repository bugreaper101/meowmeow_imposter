// Shared wire contract with the standalone realtime server (server/src).
export type Phase =
  | "lobby"
  | "writer"
  | "roleReveal"
  | "ready"
  | "clue"
  | "discussion"
  | "voting"
  | "result"
  | "scoreboard"
  | "winner";

export type Role = "writer" | "imposter" | "player" | null;

export type RoomSettings = {
  rounds: number;
  imposters: number;
  clueSeconds: number;
  discussionSeconds: number;
  writerMode: "sequential" | "random";
};

export type PublicPlayer = {
  id: string;
  nickname: string;
  avatar: string | null;
  ready: boolean;
  connected: boolean;
  host: boolean;
  score: number;
  roundScore: number;
  voted: boolean;
  mic: boolean;
  speaker: boolean;
  speaking: boolean;
  eliminated: boolean;
  roleSeen: boolean;
};

export type RoundResult = {
  eliminatedId: string | null;
  eliminatedRole: Exclude<Role, null> | null;
  tie: boolean;
  counts: Record<string, number>;
  winner: "innocents" | "imposters";
  secretWord: string | null;
  points: number;
};

export type RoomState = {
  code: string;
  phase: Phase;
  round: number;
  maxRounds: number;
  hostId: string | null;
  locked: boolean;
  finished: boolean;
  settings: RoomSettings;
  writerId: string | null;
  speakingOrder: string[];
  currentSpeakerId: string | null;
  timer: { phase: string; endsAt: number | null; duration: number } | null;
  takenAvatars: string[];
  voted: string[];
  result: RoundResult | null;
  revealedWord: string | null;
  players: PublicPlayer[];
};

export type PrivateState = {
  playerId: string;
  role: Role;
  secretWord: string | null;
  isWriter: boolean;
  isHost: boolean;
  roleSeen: boolean;
  ready: boolean;
  vote: string | null;
};

export type ServerMessage =
  | { t: "session"; playerId: string; token: string; code: string }
  | { t: "room"; room: RoomState }
  | { t: "private"; private: PrivateState }
  | { t: "peers"; peers: string[] }
  | { t: "rtc"; from: string; signal: unknown }
  | { t: "rtc-close"; from: string }
  | { t: "celebrate" }
  | { t: "pong"; at: number }
  | { t: "error"; code: string; message: string };

// Slider index <-> seconds, matching the option arrays already used by the UI.
export const CLUE_SECONDS = [0, 10, 30, 45, 60, 120, 180, 240, 300];
export const DISCUSSION_SECONDS = [0, 30, 60, 120, 180, 300, 420, 600];

export const indexOfSeconds = (list: number[], seconds: number) => {
  const i = list.indexOf(seconds);
  return i === -1 ? 0 : i;
};