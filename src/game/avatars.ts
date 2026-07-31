import { avatarCatalog, type MeowAvatar } from "@/components/meow/data";
import type { PublicPlayer } from "./protocol";

const byName = new Map(avatarCatalog.map((a) => [a.name, a]));

// The UI's Bean component is avatar-shaped, so live players are projected onto
// the catalog entry they picked (with a graceful fallback).
export function beanFor(player: PublicPlayer): MeowAvatar {
  const base = (player.avatar && byName.get(player.avatar)) || avatarCatalog[0]!;
  return { ...base, name: player.nickname, points: player.score, host: player.host, taken: false };
}

export const catalogEntry = (name: string | null) =>
  (name && byName.get(name)) || avatarCatalog[0]!;
