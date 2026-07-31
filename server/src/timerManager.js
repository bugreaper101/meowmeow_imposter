import { now } from "./utils.js";

// The server owns every timer. Clients only render the deadline it broadcasts.
const handles = new Map();

export function startTimer(room, phase, seconds, onExpire) {
  clearTimer(room);
  if (!seconds || seconds <= 0) {
    room.timer = { phase, endsAt: null, duration: 0 }; // unlimited
    return;
  }
  const endsAt = now() + seconds * 1000;
  room.timer = { phase, endsAt, duration: seconds };
  const handle = setTimeout(() => {
    handles.delete(room.code);
    if (room.destroyed) return;
    room.timer = null;
    try {
      onExpire();
    } catch {
      /* never let a timer crash the process */
    }
  }, seconds * 1000);
  handles.set(room.code, handle);
}

export function clearTimer(room) {
  const handle = handles.get(room.code);
  if (handle) clearTimeout(handle);
  handles.delete(room.code);
  room.timer = null;
}

export function hasTimer(room) {
  return handles.has(room.code);
}