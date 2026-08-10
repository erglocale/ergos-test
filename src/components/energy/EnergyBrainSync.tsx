"use client";

import { useEffect } from "react";
import { fetchEnergyOverlay } from "@/data/energyBrain";
import { setEnergyOverlay } from "@/data/store";

const POLL_MS = 10_000;

/** Polls the local energy-brain API and feeds its rows into the store. */
export default function EnergyBrainSync() {
  useEffect(() => {
    let stopped = false;
    // A single failed poll must not wipe the live rows (the backend briefly
    // rejects requests while auto-reloading or running the optimizer) — keep
    // the last good overlay and clear only after repeated failures.
    let failCount = 0;
    const tick = async () => {
      const overlay = await fetchEnergyOverlay();
      if (stopped) return;
      if (overlay) {
        failCount = 0;
        setEnergyOverlay(overlay);
      } else {
        failCount += 1;
        if (failCount >= 3) setEnergyOverlay(null);
      }
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    // Refetch immediately when the tab regains focus, so edits made in the
    // energy-brain UI show up the moment you switch back — no 10 s wait.
    const onFocus = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      setEnergyOverlay(null);
    };
  }, []);
  return null;
}
