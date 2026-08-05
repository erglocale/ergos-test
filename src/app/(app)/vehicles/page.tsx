"use client";

import { Button, Card, Col, Input, Row, Select, Typography, message } from "antd";
import { useMemo, useState } from "react";
import type { IconType } from "react-icons";
import { FaCar, FaParking, FaRoute } from "react-icons/fa";
import { FiBatteryCharging, FiSearch } from "react-icons/fi";
import AddVehicleModal from "@/components/vehicles/AddVehicleModal";
import VehicleList from "@/components/vehicles/VehiclesList";
import { useDb } from "@/data/store";

const { Title } = Typography;

const METRIC_CARDS: {
  key: "total" | "charging" | "running" | "idle";
  label: string;
  icon: IconType;
  color: string;
  bg: string;
}[] = [
  {
    key: "total",
    label: "Total Vehicles",
    icon: FaCar,
    color: "#6366f1",
    bg: "#eef2ff",
  },
  {
    key: "charging",
    label: "Vehicles Charging",
    icon: FiBatteryCharging,
    color: "#16a34a",
    bg: "#f0fdf4",
  },
  {
    key: "running",
    label: "Vehicles Running",
    icon: FaRoute,
    color: "#f97417",
    bg: "#fff7ed",
  },
  {
    key: "idle",
    label: "Vehicles Idle",
    icon: FaParking,
    color: "#64748b",
    bg: "#f8fafc",
  },
];

export default function Home() {
  const db = useDb();
  const [searchQuery, setSearchQuery] = useState("");
  const [hubFilter, setHubFilter] = useState<string | null>(null);
  const [openAddVehicleModal, setOpenAddVehicleModal] = useState(false);

  const vehicles = useMemo(
    () =>
      hubFilter ? db.vehicles.filter((v) => v.hub === hubFilter) : db.vehicles,
    [db.vehicles, hubFilter],
  );

  const hubs = useMemo(
    () => Array.from(new Set(db.vehicles.map((v) => v.hub))),
    [db.vehicles],
  );

  // Compute counts from vehicles data
  const counts = useMemo(() => {
    const total = vehicles.length;
    const running = vehicles.filter((v) => v.status === "Driving").length;
    const charging = vehicles.filter((v) => v.status === "Charging").length;
    const idle = total - running - charging;
    return { total, charging, running, idle: Math.max(0, idle) };
  }, [vehicles]);

  // Filter vehicles by search
  const filteredVehicles = useMemo(() => {
    const sorted = [...vehicles].sort(
      (a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
    );
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter(
      (v) =>
        v.reg.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q),
    );
  }, [vehicles, searchQuery]);

  return (
    <div style={{ padding: "0 16px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <Title level={3} style={{ marginBottom: 0 }}>
          Fleet Overview
        </Title>
        <div style={{ display: "flex", gap: 8 }}>
          <Button type="primary" onClick={() => setOpenAddVehicleModal(true)}>
            Add Vehicle
          </Button>
          <Button onClick={() => message.info("Not available in the sandbox")}>
            Download QR Codes
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {METRIC_CARDS.map((card) => {
          const IconComp = card.icon;
          return (
            <Col span={6} key={card.key}>
              <Card
                style={{
                  borderRadius: 12,
                  border: "1px solid #f0f0f0",
                  height: "100%",
                }}
                styles={{
                  body: {
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  },
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    backgroundColor: card.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconComp size={24} color={card.color} />
                </div>
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "#94a3b8",
                      fontWeight: 500,
                    }}
                  >
                    {card.label}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 28,
                      fontWeight: 700,
                      color: card.color,
                      lineHeight: 1.2,
                    }}
                  >
                    {counts[card.key]}
                  </p>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* Search + Filter Bar */}
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Input
          placeholder="Search by vehicle no., make or model..."
          prefix={<FiSearch size={16} color="#94a3b8" />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          allowClear
          style={{ maxWidth: 400, borderRadius: 8, height: 40 }}
        />
        <Select
          allowClear
          showSearch
          size="large"
          placeholder="Filter by hub"
          value={hubFilter || undefined}
          onChange={(v: string | undefined) => setHubFilter(v || null)}
          optionFilterProp="label"
          style={{ minWidth: 220 }}
          options={hubs.map((h) => ({ label: h, value: h }))}
        />
      </div>

      {/* Vehicle List */}
      <div style={{ paddingBottom: 30 }}>
        <VehicleList vehicles={filteredVehicles} />
      </div>

      <AddVehicleModal
        isModalOpen={openAddVehicleModal}
        handleModalVisibility={setOpenAddVehicleModal}
      />
    </div>
  );
}
