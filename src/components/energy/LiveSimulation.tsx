"use client";

import { useEffect } from "react";
import { refreshSchedules } from "@/data/liveSim";
import { flushSimulation, tickSimulation } from "@/data/store";

/** Integration step. Short enough that a 3 kW charger visibly moves the bar. */
const TICK_MS = 5_000;
/** The optimizer is expensive to run, so its plan is refreshed far less often. */
const PLAN_MS = 60_000;

/**
 * Drives the live charging simulation: steps every ongoing session forward and
 * keeps the shared energy-brain schedule (which decides who charges, when and
 * at how many kW) fresh for the integrator and the calendar.
 */
export default function LiveSimulation() {
  useEffect(() => {
    tickSimulation();
    refreshSchedules();
    const tick = setInterval(() => tickSimulation(), TICK_MS);
    const plan = setInterval(() => refreshSchedules(), PLAN_MS);
    // Timers are throttled in background tabs; catch up on return instead of
    // leaving the session frozen at whatever the last step produced. On the way
    // out, flush immediately so a reload doesn't lose the seconds since the
    // last 30 s write — pagehide is the reliable moment for that, since
    // unload/beforeunload are skipped when the page goes into the bfcache.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tickSimulation();
        refreshSchedules();
      } else {
        flushSimulation();
      }
    };
    const onFocus = () => {
      tickSimulation();
      refreshSchedules();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pagehide", flushSimulation);
    return () => {
      clearInterval(tick);
      clearInterval(plan);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pagehide", flushSimulation);
      flushSimulation();
    };
  }, []);
  return null;
}
