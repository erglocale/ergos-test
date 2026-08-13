"use client";

import { DownloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Radio,
  Space,
  Table,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import ChargerLocationMap, {
  type ChargerMapPoint,
} from "@/components/maps/ChargerLocationMap";
import { useDb } from "@/data/store";
import VehicleSelectionModal from "./VehicleSelectionModal";
import WorkHoursSlider, {
  DEFAULT_END,
  DEFAULT_START,
  minutesToTime,
} from "./WorkHoursSlider";
import {
  DateRange,
  downloadCsv,
  formatReportDate,
  getPresetRanges,
} from "./shared";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const MAX_WIDTH = 1200;

const DEFAULT_DATE_RANGE: DateRange = (() => {
  const preset = getPresetRanges().find((p) => p.label === "Last 30 days");
  return preset ? preset.value : [dayjs().subtract(29, "day"), dayjs()];
})();

// ─── Interval helpers (ported verbatim from the production report) ───────────

type Interval = [number, number];

function getClippedIntervals(
  startMs: number,
  endMs: number,
  workMinutesStart: number,
  workMinutesEnd: number,
): Interval[] {
  if (!startMs || !endMs || endMs <= startMs) return [];

  const result: Interval[] = [];
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);

  const lastDay = new Date(endMs);
  lastDay.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= lastDay.getTime()) {
    const dayMs = cursor.getTime();
    const wStart = dayMs + workMinutesStart * 60 * 1000;
    const wEnd = dayMs + workMinutesEnd * 60 * 1000;
    const cStart = Math.max(startMs, wStart);
    const cEnd = Math.min(endMs, wEnd);

    if (cEnd > cStart) result.push([cStart, cEnd]);

    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

function sumIntervalMs(intervals: Interval[]): number {
  return intervals.reduce((sum, [s, e]) => sum + (e - s), 0);
}

function subtractIntervals(source: Interval[], blocked: Interval[]): Interval[] {
  let result = [...source];
  for (const [bStart, bEnd] of blocked) {
    const next: Interval[] = [];
    for (const [iStart, iEnd] of result) {
      if (bEnd <= iStart || bStart >= iEnd) {
        next.push([iStart, iEnd]);
      } else {
        if (iStart < bStart) next.push([iStart, bStart]);
        if (iEnd > bEnd) next.push([bEnd, iEnd]);
      }
    }
    result = next;
  }
  return result;
}

// ─── Row shapes derived from the dummy store ─────────────────────────────────

interface ClippedTrip {
  vehicleId: string;
  startMs: number;
  endMs: number;
  distanceKm: number;
}

interface IdlePeriod {
  vehicleId: string;
  startedAtMs: number;
  durationSeconds: number;
}

interface VehicleMetric {
  vehicleId: string;
  trips: number;
  distance: number;
  tripDuration: number;
  idlePeriods: number;
  idleDuration: number;
  avgTripDuration: number;
  avgIdleDuration: number;
  utilization: number;
}

interface Metrics {
  totalTrips: number;
  totalDistance: number;
  totalTripDuration: number;
  avgTripDuration: number;
  totalIdlePeriods: number;
  totalIdleDuration: number;
  avgIdleDuration: number;
  utilizationPercentage: number;
  vehicleMetrics: VehicleMetric[];
}

function computeVehicleMetrics(
  clippedTrips: ClippedTrip[],
  clippedIdlePeriods: IdlePeriod[],
  vehicleIds: string[],
  netChargingSecsByVehicle: Record<string, number> = {},
): Metrics {
  const vehicleMap: Record<string, Omit<VehicleMetric, "avgTripDuration" | "avgIdleDuration" | "utilization">> = {};
  for (const id of vehicleIds) {
    vehicleMap[id] = {
      vehicleId: id,
      trips: 0,
      distance: 0,
      tripDuration: 0,
      idlePeriods: 0,
      idleDuration: 0,
    };
  }

  for (const trip of clippedTrips) {
    const vm = vehicleMap[trip.vehicleId];
    if (!vm) continue;
    const durSec = trip.endMs > trip.startMs ? (trip.endMs - trip.startMs) / 1000 : 0;
    vm.trips += 1;
    vm.distance += trip.distanceKm;
    vm.tripDuration += durSec;
  }

  for (const p of clippedIdlePeriods) {
    const vm = vehicleMap[p.vehicleId];
    if (!vm) continue;
    vm.idlePeriods += 1;
    vm.idleDuration += p.durationSeconds || 0;
  }

  const vehicleMetrics: VehicleMetric[] = Object.values(vehicleMap).map((vm) => {
    const chargingDeductionSec = netChargingSecsByVehicle[vm.vehicleId] ?? 0;
    const adjustedIdleDuration = Math.max(0, vm.idleDuration - chargingDeductionSec);

    return {
      ...vm,
      idleDuration: adjustedIdleDuration,
      avgTripDuration: vm.trips > 0 ? vm.tripDuration / vm.trips : 0,
      avgIdleDuration:
        vm.idlePeriods > 0 ? adjustedIdleDuration / vm.idlePeriods : 0,
      utilization: 0,
    };
  });

  const totalTrips = vehicleMetrics.reduce((s, v) => s + v.trips, 0);
  const totalDistance = vehicleMetrics.reduce((s, v) => s + v.distance, 0);
  const totalTripDuration = vehicleMetrics.reduce((s, v) => s + v.tripDuration, 0);
  const totalIdlePeriods = vehicleMetrics.reduce((s, v) => s + v.idlePeriods, 0);
  const totalIdleDuration = vehicleMetrics.reduce((s, v) => s + v.idleDuration, 0);

  return {
    totalTrips,
    totalDistance,
    totalTripDuration,
    avgTripDuration: totalTrips > 0 ? totalTripDuration / totalTrips : 0,
    totalIdlePeriods,
    totalIdleDuration,
    avgIdleDuration:
      totalIdlePeriods > 0 ? totalIdleDuration / totalIdlePeriods : 0,
    utilizationPercentage: 0,
    vehicleMetrics,
  };
}

function patchUtilization(
  metrics: Metrics,
  workHours: [number, number],
  startMs: number,
  endMs: number,
  numVehicles: number,
  chargingIntervalsByVehicle: Record<string, Interval[]> = {},
): Metrics {
  const numDays =
    dayjs(endMs).startOf("day").diff(dayjs(startMs).startOf("day"), "day") + 1;

  const shiftMinutes = workHours[1] - workHours[0];
  const windowSecsPerVehicle = shiftMinutes * 60 * numDays;

  if (windowSecsPerVehicle <= 0 || numVehicles <= 0) return metrics;

  const hasChargingExclusion =
    Object.keys(chargingIntervalsByVehicle).length > 0;

  const vehicleMetrics = metrics.vehicleMetrics.map((vm) => {
    let effectiveWindowSecs = windowSecsPerVehicle;
    if (hasChargingExclusion) {
      const intervals = chargingIntervalsByVehicle[vm.vehicleId] ?? [];
      const chargingSecs = sumIntervalMs(intervals) / 1000;
      effectiveWindowSecs = Math.max(
        windowSecsPerVehicle - chargingSecs,
        vm.tripDuration || 1,
      );
    }
    return {
      ...vm,
      utilization: (vm.tripDuration / effectiveWindowSecs) * 100,
    };
  });

  let totalEffectiveWindowSecs: number;
  if (hasChargingExclusion) {
    totalEffectiveWindowSecs = metrics.vehicleMetrics.reduce((sum, vm) => {
      const intervals = chargingIntervalsByVehicle[vm.vehicleId] ?? [];
      const chargingSecs = sumIntervalMs(intervals) / 1000;
      return (
        sum + Math.max(windowSecsPerVehicle - chargingSecs, vm.tripDuration || 1)
      );
    }, 0);
  } else {
    totalEffectiveWindowSecs = windowSecsPerVehicle * numVehicles;
  }

  const utilizationPercentage =
    totalEffectiveWindowSecs > 0
      ? (metrics.totalTripDuration / totalEffectiveWindowSecs) * 100
      : 0;

  return { ...metrics, utilizationPercentage, vehicleMetrics };
}

// ─── Idle-cluster map derivation (mirrors Reports/IdleClusterMap.jsx) ────────

const HUB_CLUSTER_COLOR = "#f97316"; // Clusters within 150m of a hub charger
const OTHER_CLUSTER_COLOR = "#3b82f6"; // Clusters away from the hub
const CLUSTER_RADIUS_METERS = 150;
/** City running speed for a 3W cargo round, used to tell driving from parked. */
const CITY_SPEED_KMH = 22;

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hashInt(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Fixtures carry no idle-period GPS point — derive a deterministic location
// near the Guwahati hub area from a string hash.
function hashPoint(key: string): { lat: number; lng: number } {
  const a = hashInt(key);
  return {
    lat: 26.11 + ((a % 1000) / 1000) * 0.02,
    lng: 91.78 + ((Math.floor(a / 1000) % 1000) / 1000) * 0.03,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds) return "0 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0)
    return `${hours} hr ${minutes > 0 ? `${minutes} min` : ""}`.trim();
  return `${minutes} min`;
}

function formatDistance(km: number): string {
  return `${Number(km).toFixed(1)} km`;
}

interface ReportParams {
  vehicleIds: string[];
  range: DateRange;
}

export default function VehicleUtilizationAnalysis() {
  const db = useDb();
  const vehicles = db.vehicles;

  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_DATE_RANGE);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>(() =>
    vehicles.map((v) => v.id),
  );
  const [workHours, setWorkHours] = useState<[number, number]>([
    DEFAULT_START,
    DEFAULT_END,
  ]);
  const [modalOpen, setModalOpen] = useState(false);
  const [reportParams, setReportParams] = useState<ReportParams | null>(() => ({
    vehicleIds: vehicles.map((v) => v.id),
    range: [
      DEFAULT_DATE_RANGE[0].startOf("day"),
      DEFAULT_DATE_RANGE[1].endOf("day"),
    ],
  }));
  const [idleDurationFilter, setIdleDurationFilter] = useState(8);
  const [mapViewFilter, setMapViewFilter] = useState<
    "all" | "in-work-hours" | "outside-work-hours"
  >("all");
  const [includeChargingSessions, setIncludeChargingSessions] = useState(true);

  const vehicleIdByReg = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.reg, v.id])),
    [vehicles],
  );
  const vehicleIdToPlate = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.id, v.reg])),
    [vehicles],
  );

  // "Query": trips in range for selected vehicles.
  const trips = useMemo(() => {
    if (!reportParams) return [];
    const idSet = new Set(reportParams.vehicleIds);
    const [start, end] = reportParams.range;
    return db.trips
      .filter((t) => {
        const vid = vehicleIdByReg[t.vehicleReg];
        if (!vid || !idSet.has(vid)) return false;
        const ts = dayjs(t.startTime);
        return !ts.isBefore(start) && !ts.isAfter(end);
      })
      .map((t) => ({
        vehicleId: vehicleIdByReg[t.vehicleReg],
        startMs: new Date(t.startTime).getTime(),
        endMs: new Date(t.endTime).getTime(),
        distanceKm: t.distanceKm,
      }));
  }, [db.trips, reportParams, vehicleIdByReg]);

  // Fixtures have no idle-period telemetry — derive idle periods from the gaps
  // between consecutive trips of the same vehicle (capped at 12 h).
  const idlePeriods = useMemo<IdlePeriod[]>(() => {
    const byVehicle: Record<string, ClippedTrip[]> = {};
    for (const t of trips) {
      (byVehicle[t.vehicleId] ??= []).push(t);
    }
    const result: IdlePeriod[] = [];
    for (const rows of Object.values(byVehicle)) {
      const sorted = [...rows].sort((a, b) => a.startMs - b.startMs);
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const gapMs = sorted[i + 1].startMs - sorted[i].endMs;
        if (gapMs <= 5 * 60 * 1000) continue; // ignore tiny gaps
        result.push({
          vehicleId: sorted[i].vehicleId,
          startedAtMs: sorted[i].endMs,
          durationSeconds: Math.min(gapMs / 1000, 12 * 3600),
        });
      }
    }
    return result;
  }, [trips]);

  const excludeCharging = !includeChargingSessions && !!reportParams;

  // Charging intervals by vehicleId, clipped to work window.
  const chargingIntervalsByVehicle = useMemo(() => {
    if (!excludeCharging || !reportParams) return {};
    const idSet = new Set(reportParams.vehicleIds);
    const map: Record<string, Interval[]> = {};
    for (const s of db.sessions) {
      const vid = vehicleIdByReg[s.vehicleReg];
      if (!vid || !idSet.has(vid)) continue;
      if (!s.endTime) continue;
      const startMs = new Date(s.startTime).getTime();
      const endMs = new Date(s.endTime).getTime();
      if (!startMs || !endMs || endMs <= startMs) continue;
      const clipped = getClippedIntervals(startMs, endMs, workHours[0], workHours[1]);
      if (clipped.length === 0) continue;
      (map[vid] ??= []).push(...clipped);
    }
    return map;
  }, [excludeCharging, db.sessions, vehicleIdByReg, workHours, reportParams]);

  // Clipped trips (in-range portion only, proportional distance).
  const workHoursClippedTrips = useMemo<ClippedTrip[]>(() => {
    if (!reportParams) return [];
    const reportStartMs = reportParams.range[0].valueOf();
    const reportEndMs = reportParams.range[1].valueOf();

    return trips
      .map((trip) => {
        const effectiveStartMs = Math.max(trip.startMs, reportStartMs);
        const effectiveEndMs = Math.min(trip.endMs, reportEndMs);
        if (effectiveEndMs <= effectiveStartMs) return null;

        const clippedIntervals = getClippedIntervals(
          effectiveStartMs,
          effectiveEndMs,
          workHours[0],
          workHours[1],
        );
        if (clippedIntervals.length === 0) return null;

        const overlapMs = sumIntervalMs(clippedIntervals);
        const tripDurationMs = trip.endMs - trip.startMs;
        const overlapFraction = overlapMs / tripDurationMs;
        const clippedStartMs = clippedIntervals[0][0];

        return {
          vehicleId: trip.vehicleId,
          startMs: clippedStartMs,
          endMs: clippedStartMs + overlapMs,
          distanceKm: trip.distanceKm * overlapFraction,
        };
      })
      .filter((t): t is ClippedTrip => t !== null);
  }, [trips, workHours, reportParams]);

  // Trip intervals map (for idle subtraction).
  const tripClippedIntervalsByVehicle = useMemo(() => {
    if (!reportParams) return {};
    const reportStartMs = reportParams.range[0].valueOf();
    const reportEndMs = reportParams.range[1].valueOf();

    const map: Record<string, Interval[]> = {};
    for (const trip of trips) {
      const effectiveStartMs = Math.max(trip.startMs, reportStartMs);
      const effectiveEndMs = Math.min(trip.endMs, reportEndMs);
      if (effectiveEndMs <= effectiveStartMs) continue;

      const clipped = getClippedIntervals(
        effectiveStartMs,
        effectiveEndMs,
        workHours[0],
        workHours[1],
      );
      if (clipped.length === 0) continue;
      (map[trip.vehicleId] ??= []).push(...clipped);
    }
    return map;
  }, [trips, workHours, reportParams]);

  // Net charging seconds per vehicle after removing trip overlap.
  const netChargingSecsByVehicle = useMemo(() => {
    if (!excludeCharging) return {};
    const result: Record<string, number> = {};
    for (const [vid, intervals] of Object.entries(chargingIntervalsByVehicle)) {
      const tripIntervals =
        (tripClippedIntervalsByVehicle as Record<string, Interval[]>)[vid] ?? [];
      const netIntervals = subtractIntervals(intervals, tripIntervals);
      result[vid] = sumIntervalMs(netIntervals) / 1000;
    }
    return result;
  }, [excludeCharging, chargingIntervalsByVehicle, tripClippedIntervalsByVehicle]);

  // Clipped idle periods — trip subtraction only.
  const workHoursClippedIdlePeriods = useMemo<IdlePeriod[]>(() => {
    if (!reportParams) return [];
    const reportStartMs = reportParams.range[0].valueOf();
    const reportEndMs = reportParams.range[1].valueOf();

    return idlePeriods
      .map((p) => {
        const pEndMs = p.startedAtMs + p.durationSeconds * 1000;
        const effectiveStartMs = Math.max(p.startedAtMs, reportStartMs);
        const effectiveEndMs = Math.min(pEndMs, reportEndMs);
        if (effectiveEndMs <= effectiveStartMs) return null;

        const clippedIntervals = getClippedIntervals(
          effectiveStartMs,
          effectiveEndMs,
          workHours[0],
          workHours[1],
        );
        if (clippedIntervals.length === 0) return null;

        const tripIntervals =
          (tripClippedIntervalsByVehicle as Record<string, Interval[]>)[
            p.vehicleId
          ] ?? [];
        const netIntervals = subtractIntervals(clippedIntervals, tripIntervals);

        const netMs = sumIntervalMs(netIntervals);
        if (netMs <= 0) return null;

        return { ...p, durationSeconds: netMs / 1000 };
      })
      .filter((p): p is IdlePeriod => p !== null);
  }, [idlePeriods, workHours, tripClippedIntervalsByVehicle, reportParams]);

  // Final metrics.
  const metrics = useMemo(() => {
    if (!reportParams) return null;

    const raw = computeVehicleMetrics(
      workHoursClippedTrips,
      workHoursClippedIdlePeriods,
      reportParams.vehicleIds,
      netChargingSecsByVehicle,
    );

    return patchUtilization(
      raw,
      workHours,
      reportParams.range[0].valueOf(),
      reportParams.range[1].valueOf(),
      reportParams.vehicleIds.length,
      chargingIntervalsByVehicle,
    );
  }, [
    workHoursClippedTrips,
    workHoursClippedIdlePeriods,
    reportParams,
    workHours,
    chargingIntervalsByVehicle,
    netChargingSecsByVehicle,
  ]);

  // Idle events behind the map. Production reads these from telemetry stops,
  // so a delivery round leaves a trail of short idles around the city and only
  // the overnight park at the hub survives the "> 8 hr" filter. Taking them
  // from the gaps *between* trips alone lost that: a fixture vehicle runs one
  // or two trips a day, so almost every gap clamped to the 12 h ceiling and
  // all five thresholds drew the same map.
  //
  // A trip here can last nine hours while covering six kilometres, and the
  // difference is time parked — so a round is split into the stops it must
  // have contained. Metrics keep using the between-trip periods: these sit
  // inside a trip and are subtracted there anyway.
  const withinTripStops = useMemo<IdlePeriod[]>(() => {
    const out: IdlePeriod[] = [];
    for (const t of trips) {
      const durationSec = (t.endMs - t.startMs) / 1000;
      if (!Number.isFinite(durationSec) || durationSec <= 0) continue;
      const drivingSec = Math.min(
        durationSec,
        (t.distanceKm / CITY_SPEED_KMH) * 3600,
      );
      const parkedSec = durationSec - drivingSec;
      if (parkedSec < 20 * 60) continue;

      const h = hashInt(`${t.vehicleId}:${t.startMs}`);
      // How the parked time breaks up varies by round — one long wait at a
      // warehouse, or four drops of half an hour. That variety is the point:
      // it puts idle events in every band the filter offers, so raising the
      // threshold thins the map out instead of leaving it untouched.
      const maxStops = Math.max(1, Math.min(4, Math.floor(parkedSec / (40 * 60))));
      const stops = 1 + (h % maxStops);
      // Uneven but deterministic split, so the durations spread across the
      // filter's bands instead of landing on one value.
      const weights: number[] = [];
      let totalWeight = 0;
      for (let i = 0; i < stops; i += 1) {
        const w = 0.6 + ((h >> (i * 3)) % 100) / 125;
        weights.push(w);
        totalWeight += w;
      }
      for (let i = 0; i < stops; i += 1) {
        out.push({
          vehicleId: t.vehicleId,
          startedAtMs: Math.round(
            t.startMs + ((i + 0.5) / stops) * durationSec * 1000,
          ),
          durationSeconds: (parkedSec * weights[i]) / totalWeight,
        });
      }
    }
    return out;
  }, [trips]);

  const mapIdlePeriods = useMemo(
    () => [...idlePeriods, ...withinTripStops],
    [idlePeriods, withinTripStops],
  );

  // Map idle periods (feeds the placeholder count).
  const filteredIdlePeriods = useMemo(() => {
    let filtered = mapIdlePeriods;

    if (idleDurationFilter > 0) {
      const minSeconds = idleDurationFilter * 3600;
      filtered = filtered.filter((p) => p.durationSeconds >= minSeconds);
    }

    if (mapViewFilter === "in-work-hours") {
      filtered = filtered.filter((p) => {
        const d = new Date(p.startedAtMs);
        const m = d.getHours() * 60 + d.getMinutes();
        return m >= workHours[0] && m <= workHours[1];
      });
    } else if (mapViewFilter === "outside-work-hours") {
      filtered = filtered.filter((p) => {
        const d = new Date(p.startedAtMs);
        const m = d.getHours() * 60 + d.getMinutes();
        return m < workHours[0] || m > workHours[1];
      });
    }

    if (excludeCharging && Object.keys(chargingIntervalsByVehicle).length > 0) {
      filtered = filtered.filter((p) => {
        const chargingIntervals = (
          chargingIntervalsByVehicle as Record<string, Interval[]>
        )[p.vehicleId];
        if (!chargingIntervals || chargingIntervals.length === 0) return true;
        return !chargingIntervals.some(
          ([cStart, cEnd]) => p.startedAtMs >= cStart && p.startedAtMs < cEnd,
        );
      });
    }

    return filtered;
  }, [
    mapIdlePeriods,
    idleDurationFilter,
    mapViewFilter,
    workHours,
    excludeCharging,
    chargingIntervalsByVehicle,
  ]);

  // Idle cluster centroids for the map: deterministic per-period points,
  // proximity-clustered like the production IdleClusterMap, colored by
  // whether the centroid sits near a hub charger.
  const idleClusterPoints = useMemo<ChargerMapPoint[]>(() => {
    type Cluster = { lat: number; lng: number; periods: IdlePeriod[] };
    const clusters: Cluster[] = [];

    for (const p of filteredIdlePeriods) {
      const pt = hashPoint(`${p.vehicleId}:${p.startedAtMs}`);
      let matched: Cluster | null = null;
      for (const c of clusters) {
        if (
          haversineMeters(pt.lat, pt.lng, c.lat, c.lng) <= CLUSTER_RADIUS_METERS
        ) {
          matched = c;
          break;
        }
      }
      if (!matched) {
        clusters.push({ ...pt, periods: [p] });
        continue;
      }
      matched.periods.push(p);
      const n = matched.periods.length;
      matched.lat = (matched.lat * (n - 1) + pt.lat) / n;
      matched.lng = (matched.lng * (n - 1) + pt.lng) / n;
    }

    return clusters.map((c) => {
      const nearHub = db.chargepoints.some(
        (cp) =>
          haversineMeters(c.lat, c.lng, cp.lat, cp.lng) <=
          CLUSTER_RADIUS_METERS,
      );
      const totalSec = c.periods.reduce((s, p) => s + p.durationSeconds, 0);
      const plates = Array.from(
        new Set(
          c.periods.map((p) => vehicleIdToPlate[p.vehicleId] || p.vehicleId),
        ),
      );
      return {
        lat: c.lat,
        lng: c.lng,
        count: c.periods.length,
        color: nearHub ? HUB_CLUSTER_COLOR : OTHER_CLUSTER_COLOR,
        label: `${nearHub ? "Hub " : ""}Idle Cluster — ${c.periods.length} period${c.periods.length === 1 ? "" : "s"} · ${formatDuration(totalSec)} · ${plates.join(", ")}`,
      };
    });
  }, [filteredIdlePeriods, db.chargepoints, vehicleIdToPlate]);

  const handleGenerateReport = () => {
    const [start, end] = dateRange;
    if (!start || !end || selectedVehicleIds.length === 0) return;
    setReportParams({
      vehicleIds: selectedVehicleIds,
      range: [start.startOf("day"), end.endOf("day")],
    });
  };

  const handleDownloadReport = () => {
    if (!reportParams || !metrics) return;
    const [start, end] = reportParams.range;
    const startStr = formatReportDate(start);
    const endStr = formatReportDate(end);

    const numDays = end.startOf("day").diff(start.startOf("day"), "day") + 1;
    const shiftMinutes = workHours[1] - workHours[0];

    const rows: (string | number)[][] = [];
    rows.push(["Vehicle Utilization Analysis Report"]);
    rows.push(["Period", `${startStr} to ${endStr}`]);
    rows.push(["Days in range", numDays]);
    rows.push(["Vehicles", reportParams.vehicleIds.length]);
    rows.push([
      "Work Hours",
      `${minutesToTime(workHours[0])} to ${minutesToTime(workHours[1])} (${(shiftMinutes / 60).toFixed(1)} hr/day)`,
    ]);
    rows.push([]);

    rows.push(["Summary"]);
    rows.push(["Total Trips", metrics.totalTrips]);
    rows.push(["Total Distance (km)", metrics.totalDistance.toFixed(2)]);
    rows.push(["Total Trip Duration", formatDuration(metrics.totalTripDuration)]);
    rows.push(["Average Trip Duration", formatDuration(metrics.avgTripDuration)]);
    rows.push(["Total Idle Periods", metrics.totalIdlePeriods]);
    rows.push(["Total Idle Duration", formatDuration(metrics.totalIdleDuration)]);
    rows.push(["Average Idle Duration", formatDuration(metrics.avgIdleDuration)]);
    rows.push(["Utilization %", `${metrics.utilizationPercentage.toFixed(1)}%`]);
    rows.push([]);

    rows.push(["Vehicle-wise Metrics"]);
    rows.push([
      "Vehicle",
      "Trips",
      "Distance (km)",
      "Trip Duration",
      "Avg Trip Duration",
      "Idle Periods",
      "Idle Duration",
      "Avg Idle Duration",
      "Utilization (%)",
    ]);
    metrics.vehicleMetrics.forEach((vm) => {
      rows.push([
        vehicleIdToPlate[vm.vehicleId] || `Vehicle ${vm.vehicleId}`,
        vm.trips,
        vm.distance.toFixed(2),
        formatDuration(vm.tripDuration),
        formatDuration(vm.avgTripDuration),
        vm.idlePeriods,
        formatDuration(vm.idleDuration),
        formatDuration(vm.avgIdleDuration),
        `${vm.utilization.toFixed(1)}%`,
      ]);
    });
    rows.push([]);

    downloadCsv(
      rows,
      `Vehicle_Utilization_Analysis_Report_${startStr.slice(0, 10)}_to_${endStr.slice(0, 10)}.csv`,
    );
  };

  const hasReportParams = !!reportParams;
  const hasData = trips.length > 0 || idlePeriods.length > 0;
  const showReport = hasReportParams && hasData;
  const showEmptyState = hasReportParams && !hasData;

  const criteriaUnchanged =
    reportParams &&
    dateRange[0].startOf("day").valueOf() === reportParams.range[0].valueOf() &&
    dateRange[1].endOf("day").valueOf() === reportParams.range[1].valueOf() &&
    selectedVehicleIds.length === reportParams.vehicleIds.length &&
    selectedVehicleIds.every((id) => reportParams.vehicleIds.includes(id));
  const criteriaChanged = hasReportParams && !criteriaUnchanged;

  const tableColumns: TableProps<VehicleMetric & { vehiclePlate: string }>["columns"] = [
    { title: "Vehicle", dataIndex: "vehiclePlate", key: "vehicle" },
    { title: "Trips", dataIndex: "trips", key: "trips", align: "right" },
    {
      title: "Distance (km)",
      dataIndex: "distance",
      key: "distance",
      align: "right",
      render: (v: number) => formatDistance(v),
    },
    {
      title: "Trip Duration",
      dataIndex: "tripDuration",
      key: "tripDuration",
      align: "right",
      render: (v: number) => formatDuration(v),
    },
    {
      title: "Avg Trip Duration",
      dataIndex: "avgTripDuration",
      key: "avgTripDuration",
      align: "right",
      render: (v: number) => formatDuration(v),
    },
    {
      title: "Idle Periods",
      dataIndex: "idlePeriods",
      key: "idlePeriods",
      align: "right",
    },
    {
      title: "Idle Duration",
      dataIndex: "idleDuration",
      key: "idleDuration",
      align: "right",
      render: (v: number) => formatDuration(v),
    },
    {
      title: "Avg Idle Duration",
      dataIndex: "avgIdleDuration",
      key: "avgIdleDuration",
      align: "right",
      render: (v: number) => formatDuration(v),
    },
    {
      title: "Utilization (%)",
      dataIndex: "utilization",
      key: "utilization",
      align: "right",
      render: (v: number) => `${v.toFixed(1)}%`,
    },
  ];

  return (
    <div style={{ padding: "0 0 24px 0", maxWidth: MAX_WIDTH, margin: "0 auto" }}>
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Card size="small">
          <Space orientation="vertical" size="small" style={{ width: "100%" }}>
            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <Space wrap align="center">
              <RangePicker
                format={DATE_FORMAT}
                value={dateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1])
                    setDateRange([dates[0], dates[1]]);
                }}
                allowClear={false}
                presets={getPresetRanges()}
              />
              <Button onClick={() => setModalOpen(true)}>
                {`Select Vehicles (${selectedVehicleIds.length})`}
              </Button>
              <Button
                type="primary"
                onClick={handleGenerateReport}
                disabled={
                  !dateRange[0] || !dateRange[1] || selectedVehicleIds.length === 0
                }
              >
                Generate Report
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleDownloadReport}
                disabled={!hasReportParams}
                title="Download report (CSV)"
              />
            </Space>

            <WorkHoursSlider value={workHours} onChange={setWorkHours} />

            {/* ── Charging Sessions ────────────────────────────────────── */}
            <Space align="center" size="middle" style={{ paddingTop: 2 }}>
              <Text strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                Charging Sessions
              </Text>
              <Radio.Group
                value={includeChargingSessions ? "include" : "exclude"}
                onChange={(e) =>
                  setIncludeChargingSessions(e.target.value === "include")
                }
              >
                <Radio.Button value="include">Include</Radio.Button>
                <Radio.Button value="exclude">Exclude</Radio.Button>
              </Radio.Group>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {includeChargingSessions
                  ? "⚡ Charging time is counted as idle within the shift window."
                  : "⚡ Charging time is excluded from idle within the shift window."}
              </Text>
            </Space>
          </Space>
        </Card>

        {criteriaChanged && (showReport || showEmptyState) && (
          <Alert
            type="info"
            showIcon
            message="Criteria have changed."
            description="Click Generate Report to refresh. Work hours changes apply automatically."
          />
        )}

        {showReport && metrics && (
          <>
            {/* ── KPI Summary ─────────────────────────────────────────── */}
            <Card size="small" title="Vehicle Utilization Metrics">
              <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 16,
                  }}
                >
                  <div style={{ borderLeft: "3px solid #1890ff", paddingLeft: 12 }}>
                    <Text type="secondary">Total Trips</Text>
                    <Title level={4} style={{ margin: "4px 0 2px" }}>
                      {metrics.totalTrips}
                    </Title>
                  </div>
                  <div style={{ borderLeft: "3px solid #52c41a", paddingLeft: 12 }}>
                    <Text type="secondary">Total Distance</Text>
                    <Title level={4} style={{ margin: "4px 0 2px" }}>
                      {formatDistance(metrics.totalDistance)}
                    </Title>
                  </div>
                  <div style={{ borderLeft: "3px solid #faad14", paddingLeft: 12 }}>
                    <Text type="secondary">Total Trip Duration</Text>
                    <Title level={4} style={{ margin: "4px 0 2px" }}>
                      {formatDuration(metrics.totalTripDuration)}
                    </Title>
                    <Text>Avg: {formatDuration(metrics.avgTripDuration)}</Text>
                  </div>
                  <div style={{ borderLeft: "3px solid #f5222d", paddingLeft: 12 }}>
                    <Text type="secondary">Total Idle Time</Text>
                    <Title level={4} style={{ margin: "4px 0 2px" }}>
                      {formatDuration(metrics.totalIdleDuration)}
                    </Title>
                    <Text>{metrics.totalIdlePeriods} periods</Text>
                  </div>
                  <div style={{ borderLeft: "3px solid #722ed1", paddingLeft: 12 }}>
                    <Text type="secondary">Utilization</Text>
                    <Title level={4} style={{ margin: "4px 0 2px" }}>
                      {metrics.utilizationPercentage.toFixed(1)}%
                    </Title>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      trip time / shift window
                    </Text>
                  </div>
                </div>
              </Space>
            </Card>

            {/* ── Vehicle-wise Table ───────────────────────────────────── */}
            <Card size="small" title="Vehicle-wise Metrics">
              <Table
                dataSource={metrics.vehicleMetrics.map((vm) => ({
                  ...vm,
                  vehiclePlate:
                    vehicleIdToPlate[vm.vehicleId] || `Vehicle ${vm.vehicleId}`,
                }))}
                rowKey={(record) => record.vehicleId}
                columns={tableColumns}
                pagination={
                  metrics.vehicleMetrics.length > 10 ? { pageSize: 10 } : false
                }
                scroll={{ x: "max-content" }}
              />
            </Card>

            {/* ── Idle Time Analysis Map ───────────────────────────────── */}
            <Card size="small" title="Idle Time Analysis">
              <Space orientation="vertical" style={{ width: "100%" }} size="middle">
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <Text strong>IDLE DURATION</Text>
                    <Radio.Group
                      value={idleDurationFilter}
                      onChange={(e) => setIdleDurationFilter(e.target.value)}
                      style={{ marginLeft: 16 }}
                    >
                      <Radio.Button value={1}>{"> 1 hr"}</Radio.Button>
                      <Radio.Button value={2}>{"> 2 hr"}</Radio.Button>
                      <Radio.Button value={4}>{"> 4 hr"}</Radio.Button>
                      <Radio.Button value={6}>{"> 6 hr"}</Radio.Button>
                      <Radio.Button value={8}>{"> 8 hr"}</Radio.Button>
                    </Radio.Group>
                  </div>
                  <div>
                    <Text strong>IDLE TIME</Text>
                    <Radio.Group
                      value={mapViewFilter}
                      onChange={(e) => setMapViewFilter(e.target.value)}
                      style={{ marginLeft: 16 }}
                    >
                      <Radio.Button value="all">All</Radio.Button>
                      <Radio.Button value="in-work-hours">
                        In Work Hours
                      </Radio.Button>
                      <Radio.Button value="outside-work-hours">
                        Outside Work Hours
                      </Radio.Button>
                    </Radio.Group>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: "#f97316",
                        marginRight: 6,
                      }}
                    />
                    <Text type="secondary">Hub</Text>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: "#3b82f6",
                        marginRight: 6,
                      }}
                    />
                    <Text type="secondary">Other</Text>
                  </span>
                </div>
                <ChargerLocationMap points={idleClusterPoints} height={360} />
              </Space>
            </Card>
          </>
        )}

        {showEmptyState && (
          <Card>
            <Text type="secondary">No data found for the selected criteria.</Text>
          </Card>
        )}
      </Space>

      <VehicleSelectionModal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onConfirm={(ids) => {
          setSelectedVehicleIds(ids ?? []);
          setModalOpen(false);
        }}
        selectedVehicleIds={selectedVehicleIds}
      />
    </div>
  );
}
