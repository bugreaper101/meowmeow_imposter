// Central configuration. Everything is overridable through environment variables.
const num = (v, d) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || "0.0.0.0",
  env: process.env.NODE_ENV || "development",
  origins: (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()),

  minPlayers: num(process.env.MIN_PLAYERS, 3),
  maxPlayers: num(process.env.MAX_PLAYERS, 30),
  maxRounds: num(process.env.MAX_ROUNDS, 50),
  maxImposters: num(process.env.MAX_IMPOSTERS, 5),

  nicknameMin: 3,
  nicknameMax: 12,
  wordMax: 18,

  writerSeconds: num(process.env.WRITER_SECONDS, 90),
  readySeconds: num(process.env.READY_SECONDS, 45),
  roleRevealSeconds: num(process.env.ROLE_REVEAL_SECONDS, 30),
  votingSeconds: num(process.env.VOTING_SECONDS, 45),
  resultSeconds: num(process.env.RESULT_SECONDS, 30),

  reconnectGraceMs: num(process.env.RECONNECT_GRACE_MS, 45_000),
  emptyRoomGraceMs: num(process.env.EMPTY_ROOM_GRACE_MS, 10_000),
  roomMaxLifetimeMs: num(process.env.ROOM_MAX_LIFETIME_MS, 6 * 60 * 60 * 1000),

  // anti-spam
  rateWindowMs: 1000,
  rateMaxEvents: 25,

  scoreInnocentWin: num(process.env.SCORE_INNOCENT_WIN, 50),
  scoreImposterWin: num(process.env.SCORE_IMPOSTER_WIN, 50),
  scoreWriterBonus: num(process.env.SCORE_WRITER_BONUS, 20),
};

export const isProd = config.env === "production";