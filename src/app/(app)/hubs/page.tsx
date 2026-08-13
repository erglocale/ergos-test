"use client";

import { Card, Empty, Progress, Tag, Typography } from "antd";
import Link from "next/link";
import { useMemo } from "react";
import ChargerScheduleCalendar from "@/components/chargers/ChargerScheduleCalendar";
import { useDb } from "@/data/store";

const { Title, Text } = Typography;

interface HubSummary {
  name: string;
  address: string;
  chargers: number;
  connectors: number;
  inUse: number;
  vehicles: number;
  chargingVehicles: number;
}

export default function HubsIndex() {
  const db = useDb();

  const hubs = useMemo<HubSummary[]>(() => {
    const ongoingByCharger = new Map<string, number>();
    for (const s of db.sessions) {
      if (s.endTime === null) {
        ongoingByCharger.set(s.chargerId, (ongoingByCharger.get(s.chargerId) ?? 0) + 1);
      }
    }
    const map = new Map<string, HubSummary>();
    for (const cp of db.chargepoints) {
      const h =
        map.get(cp.hub) ??
        ({
          name: cp.hub,
          address: cp.address,
          chargers: 0,
          connectors: 0,
          inUse: 0,
          vehicles: 0,
          chargingVehicles: 0,
        } satisfies HubSummary);
      h.chargers += 1;
      h.connectors += cp.connectors.length;
      const busy = Math.min(cp.connectors.length, ongoingByCharger.get(cp.id) ?? 0);
      h.inUse += busy;
      // Count vehicles charging AT this hub's chargers, the same rule the hub
      // detail page uses, so the two never disagree.
      h.chargingVehicles += busy;
      map.set(cp.hub, h);
    }
    for (const v of db.vehicles) {
      const h = map.get(v.hub);
      if (!h) continue;
      h.vehicles += 1;
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [db.chargepoints, db.vehicles, db.sessions]);

  if (!hubs.length) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Empty description="No hubs yet — add a charger to create one." />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <Title level={3} style={{ marginBottom: 16 }}>
        Hubs
      </Title>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {hubs.map((hub) => {
          const pct = hub.connectors ? Math.round((hub.inUse / hub.connectors) * 100) : 0;
          return (
            <Link key={hub.name} href={`/hubs/${encodeURIComponent(hub.name)}`}>
              <Card
                hoverable
                style={{ borderRadius: 12, border: "1px solid #f0f0f0", height: "100%" }}
                styles={{ body: { padding: 16 } }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Text strong style={{ fontSize: 16 }}>
                      {hub.name}
                    </Text>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{hub.address}</div>
                  </div>
                  <Progress
                    type="circle"
                    size={52}
                    percent={pct}
                    strokeColor={pct > 0 ? "#16a34a" : "#d1d5db"}
                    format={(p) => `${p}%`}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <Tag>
                    {hub.chargers} charger{hub.chargers === 1 ? "" : "s"}
                  </Tag>
                  <Tag>
                    {hub.inUse}/{hub.connectors} connectors in use
                  </Tag>
                  <Tag>{hub.vehicles} vehicles</Tag>
                  {hub.chargingVehicles > 0 && (
                    <Tag color="green">{hub.chargingVehicles} charging</Tag>
                  )}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Chargepoints live here now rather than in their own nav item: the
          schedule already groups by hub, so it reads as the hubs' detail. */}
      <Card
        style={{ borderRadius: 12, border: "1px solid #f0f0f0", marginTop: 16 }}
        styles={{ body: { padding: 16 } }}
      >
        <Text strong style={{ display: "block", marginBottom: 4 }}>
          Chargers
        </Text>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
          Sessions per charger across every hub — past on the left of the line, optimized future
          charging on the right.
        </div>
        <ChargerScheduleCalendar chargers={db.chargepoints} />
      </Card>
    </div>
  );
}
