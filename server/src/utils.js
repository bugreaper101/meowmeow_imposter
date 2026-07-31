import { randomBytes, randomInt } from "node:crypto";

export const now = () => Date.now();

export function id(prefix = "p") {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function token() {
  return randomBytes(24).toString("hex");
}

export function roomCode() {
  let out = "";
  for (let i = 0; i < 5; i += 1) out += String(randomInt(0, 10));
  return out;
}

export function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pickRandom(list) {
  if (!list.length) return undefined;
  return list[randomInt(0, list.length)];
}

export function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]/g, " ").trim().slice(0, max);
}

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s]+$/u;
export const isEmojiOnly = (value) => EMOJI_ONLY.test(value);