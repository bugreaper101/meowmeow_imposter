import { useEffect, useState } from "react";

// The server owns the clock; the client only renders the remaining time from
// the authoritative endsAt epoch, so tab throttling can't desync a round.
export function useCountdown(endsAt: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return { seconds: null as number | null, label: "∞", expired: false };
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return { seconds, label: formatClock(seconds), expired: seconds <= 0 };
}

export function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}