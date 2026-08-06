"use client";

// Read-only client for the analytics API — the same service analytics-ui
// publishes suggestions to. Rows come back snake_case straight from the
// suggestion.* schema; the mappers below reshape them into the camelCase
// payloads the production ergOS backend serves (/host/suggestion), so the
// page and drawer render live rows through the exact same components as the
// demo fixtures. Requests go through the Next server's /live-api rewrite
// (see next.config.ts) so they're same-origin — no CORS, and ad blockers
// can't kill them for hitting an "analytics" hostname. The real base URL
// stays in .env.local and is never committed.

import type { CapRow, NudgeRow } from "./derive";

/** Non-empty when live mode is configured; the page uses it to gate the toggle. */
export const ANALYTICS_API = process.env.NEXT_PUBLIC_ANALYTICS_API ?? "";

const API_BASE = "/live-api";

export interface LiveGroup {
  id: string;
  name: string;
  hostType: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Analytics API ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export function fetchGroups(): Promise<LiveGroup[]> {
  return getJson<LiveGroup[]>("/api/groups");
}

interface ApiCapRow {
  ev_id: string | number;
  label: string | null;
  suggested_cap: number | null;
  lowest_safe_cap: number | null;
  tolerance_pct: number | null;
  operating_days: number | null;
  sweep: { cap: number; added_pct: number }[] | null;
  window_from: string | null;
  window_to: string | null;
  computed_at: string | null;
}

export async function fetchLiveCapRows(gid: string): Promise<CapRow[]> {
  const rows = await getJson<ApiCapRow[]>(`/api/groups/${gid}/soc-caps`);
  return rows.map((r) => ({
    suggestionId: `live-${r.ev_id}`,
    evId: String(r.ev_id),
    label: r.label || `EV ${r.ev_id}`,
    windowFrom: r.window_from ?? "",
    windowTo: r.window_to ?? "",
    computedAt: r.computed_at ?? "",
    socLimit:
      r.suggested_cap != null
        ? {
            suggested_cap: r.suggested_cap,
            lowest_safe_cap: r.lowest_safe_cap ?? r.suggested_cap,
          }
        : null,
    details: {
      cap: {
        sweep: r.sweep ?? [],
        lowest_safe_cap: r.lowest_safe_cap ?? 0,
        tolerance_pct: r.tolerance_pct ?? 0,
        operating_days: r.operating_days ?? 0,
      },
    },
  }));
}

interface ApiNudgeRow {
  ev_id: string | number;
  label: string | null;
  hub: string | null;
  soc: number | null;
  target_cap: number | null;
  slack_min: number | null;
  rank: number | null;
  reason: string | null;
  outcome: string | null;
  created_at: string;
}

interface ApiPreviewNudge {
  ev_id: string | number;
  label: string | null;
  hub: string | null;
  soc: number | null;
  target_cap: number | null;
  hub_distance_km: number | null;
  slack_min: number | null;
  rank: number | null;
  reason: string | null;
}

interface ApiPreview {
  hour: number;
  nudges: ApiPreviewNudge[];
}

/**
 * The live "plug in now" decision: runs the realtime allocator read-only via
 * /nudges/preview. The engine occasionally hiccups on live telemetry, so a
 * failure falls back to recently logged nudges (latest per vehicle,
 * unresolved only) rather than surfacing an error.
 */
export async function fetchLiveNudges(gid: string): Promise<NudgeRow[]> {
  try {
    const p = await getJson<ApiPreview>(`/api/groups/${gid}/nudges/preview`);
    const now = new Date().toISOString();
    return p.nudges
      .map((r) => ({
        evId: String(r.ev_id),
        label: r.label || `EV ${r.ev_id}`,
        hub: r.hub ?? "",
        soc: r.soc,
        reason: r.reason ?? "",
        createdAt: now,
        targetCap: r.target_cap,
        slackMin: r.slack_min,
        hubDistanceKm: r.hub_distance_km,
        rank: r.rank,
        _kind: "charge" as const,
      }))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  } catch {
    return fetchLoggedNudges(gid);
  }
}

async function fetchLoggedNudges(gid: string, hours = 6): Promise<NudgeRow[]> {
  const rows = await getJson<ApiNudgeRow[]>(
    `/api/groups/${gid}/nudges?hours=${hours}`,
  );
  const seen = new Set<string>();
  const out: NudgeRow[] = [];
  for (const r of rows) {
    // Rows arrive newest-first, so the first hit per vehicle is its latest.
    const evId = String(r.ev_id);
    if (seen.has(evId)) continue;
    seen.add(evId);
    if (r.outcome && r.outcome !== "pending") continue;
    out.push({
      evId,
      label: r.label || `EV ${r.ev_id}`,
      hub: r.hub ?? "",
      soc: r.soc,
      reason: r.reason ?? "",
      createdAt: r.created_at,
      targetCap: r.target_cap,
      slackMin: r.slack_min,
      hubDistanceKm: null,
      rank: r.rank,
      _kind: "charge",
    });
  }
  return out.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
}
