import { useSyncExternalStore } from "react";
import type { PrivateState, RoomState } from "./protocol";

export type ConnectionStatus = "idle" | "connecting" | "online" | "reconnecting" | "offline";

export type GameState = {
  status: ConnectionStatus;
  playerId: string | null;
  room: RoomState | null;
  self: PrivateState | null;
  peers: string[];
  lastError: { code: string; message: string } | null;
  celebrateAt: number;
};

const initial: GameState = {
  status: "idle",
  playerId: null,
  room: null,
  self: null,
  peers: [],
  lastError: null,
  celebrateAt: 0,
};

let state: GameState = initial;
const listeners = new Set<() => void>();

export function getGameState() {
  return state;
}

export function setGameState(patch: Partial<GameState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function resetGameState() {
  state = { ...initial };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGame(): GameState {
  return useSyncExternalStore(subscribe, getGameState, () => initial);
}