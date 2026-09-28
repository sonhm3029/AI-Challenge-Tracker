"use client";

import { useSyncExternalStore } from "react";

function subscribeToClock(callback: () => void) {
  const interval = setInterval(callback, 30000);
  return () => clearInterval(interval);
}

function getClockSnapshot() {
  return Date.now();
}

function getServerClockSnapshot() {
  // Rendered once on the server; the client re-renders with a real
  // timestamp immediately after hydration via useSyncExternalStore.
  return 0;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Closed";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

/**
 * Section 30 — Countdown is calculated client-side from a stored deadline
 * timestamp. Once the deadline passes it stops counting negative and simply
 * reports "Closed"; recomputing the *next* milestone is the server's job
 * (it re-renders with a different milestone on the next page load/revalidate).
 *
 * Reads the clock via useSyncExternalStore rather than `Date.now()` directly
 * in render/state, which React treats as an impure read during render.
 */
export function Countdown({ deadline }: { deadline: string | null }) {
  const target = deadline ? new Date(deadline).getTime() : null;
  const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);

  if (!target || now === 0) {
    return <span className="font-mono text-sm text-stone-500">{target ? "…" : "Closed"}</span>;
  }

  return (
    <span className="font-mono text-sm font-semibold tabular-nums" aria-live="polite">
      {formatRemaining(target - now)}
    </span>
  );
}
