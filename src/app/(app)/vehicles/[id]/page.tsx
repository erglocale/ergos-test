"use client";

import { InfoCircleOutlined, QrcodeOutlined } from "@ant-design/icons";
import { Button, Col, Empty, Popconfirm, QRCode, Row, Segmented, Statistic, Tabs, Tooltip, message } from "antd";
import dayjs from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import BatteryStatusCard from "@/components/vehicles/detail/BatteryStatusCard";
import CheckinLogsTab from "@/components/vehicles/detail/CheckinLogsTab";
import DocumentsTab from "@/components/vehicles/detail/DocumentsTab";
import EditSocLimitModal from "@/components/vehicles/detail/EditSocLimitModal";
import MapCard from "@/components/vehicles/detail/MapCard";
import SpecsCard from "@/components/vehicles/detail/SpecsCard";
import { PulseKeyframes, SURFACE_CARD_STYLE } from "@/components/vehicles/detail/ui";
import VehicleAnalytics from "@/components/vehicles/detail/VehicleAnalytics";
import VehicleHeader from "@/components/vehicles/detail/VehicleHeader";
import VehicleSessionsTable from "@/components/vehicles/detail/VehicleSessionsTable";
import { fmtDate } from "@/components/vehicles/detail/vehicleDetailUtils";
import { useDb } from "@/data/store";

function KpiTile({
  title,
  tip,
  value,
  suffix,
  since,
}: {
  title: string;
  tip?: string;
  value: string | number;
  suffix?: string;
  since?: string | null;
}) {
  return (
    <div style={{ ...SURFACE_CARD_STYLE, background: "#fff", padding: 12 }}>
      <Statistic
        title={
          <div className="flex items-center text-[11px] uppercase tracking-wider text-gray-500">
            <span>{title}</span>
            {tip && (
              <Tooltip title={tip} mouseEnterDelay={0}>
                <InfoCircleOutlined className="ml-1" />
              </Tooltip>
            )}
          </div>
        }
        valueStyle={{ fontWeight: 700, fontSize: 19, color: "#1a1f2e" }}
        suffix={suffix ? <span className="text-xs font-normal text-gray-500">{suffix}</span> : null}
        value={value}
      />
      {since && <div className="mt-0.5 text-[10px] text-gray-400">Since {since}</div>}
    </div>
  );
}

export default function VehicleDetail() {
  const params = useParams<{ id: string }>();
  const vehicleId = decodeURIComponent(params.id);
  const router = useRouter();
  const db = useDb();

  const [activeTabKey, setActiveTabKey] = useState("1");
  const [statsPeriod, setStatsPeriod] = useState<string | number>("all");
  const [openEditVehicleModal, setOpenEditVehicleModal] = useState(false);

  // extract query param "activeTab" (same behaviour as production)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setActiveTabKey(urlParams.get("activeTab") || "1");
  }, []);

  const vehicle = db.vehicles.find((v) => v.id === vehicleId);
  const driver = vehicle
    ? (db.drivers.find((d) => d.id === vehicle.driverId) ??
      db.drivers.find((d) => d.vehicleReg === vehicle.reg))
    : undefined;

  // KPI strip metrics — production hits the analytics single-metrics
  // endpoint; the sandbox aggregates db.trips / db.sessions by reg.
  const kpis = useMemo(() => {
    if (!vehicle) return { distanceKm: 0, energyUsed: 0, energyCharged: 0, sessionCount: 0 };
    const cutoff =
      statsPeriod === "7d"
        ? dayjs().subtract(7, "day")
        : statsPeriod === "30d"
          ? dayjs().subtract(30, "day")
          : null;
    const inWindow = (iso: string) => !cutoff || !dayjs(iso).isBefore(cutoff);
    const trips = db.trips.filter((t) => t.vehicleReg === vehicle.reg && inWindow(t.startTime));
    const sessions = db.sessions.filter((s) => s.vehicleReg === vehicle.reg && inWindow(s.startTime));
    return {
      distanceKm: trips.reduce((acc, t) => acc + t.distanceKm, 0),
      energyUsed: trips.reduce((acc, t) => acc + t.energyKwh, 0),
      energyCharged: sessions.reduce((acc, s) => acc + s.energyKwh, 0),
      sessionCount: sessions.length,
    };
  }, [db.trips, db.sessions, vehicle, statsPeriod]);

  if (!vehicle) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Empty description={`Vehicle ${vehicleId} not found`} />
      </div>
    );
  }

  const trackingSinceLabel = fmtDate(vehicle.createdAt);

  // What to display as the small caption under each KPI value.
  const statsPeriodLabel =
    statsPeriod === "7d" ? "last 7 days" : statsPeriod === "30d" ? "last 30 days" : trackingSinceLabel;

  const avgCostPerKwh = kpis.energyCharged > 0 ? kpis.energyCharged * 9.2 : 0; // fixtures: ~₹9.2/kWh

  const qrCodeButton = (
    <Popconfirm
      title={`QR Code :: ${vehicle.reg}`}
      placement="left"
      description={
        <div style={{ marginRight: "20px" }}>
          <div id={`charger-qr-code-${vehicleId}`} className="p-3">
            <QRCode
              value={`https://erglocale.onelink.me/rQV7/production?evId=${vehicleId}&scanType=vehicle`}
              bgColor="#fff"
              size={300}
              errorLevel="H"
              type="svg"
            />
            <div className="mt-2 flex flex-col gap-1 p-1 px-2 pb-3 text-2xl font-extrabold">
              <div className="flex justify-center">
                <p className="">VEHICLE ID -</p>
                <p className="ml-1"> {vehicleId}</p>
              </div>
            </div>
          </div>
        </div>
      }
      onConfirm={() => message.info("Not available in the sandbox")}
      okText="Download"
      showCancel={false}
    >
      <Button size="small" color="primary" variant="outlined" icon={<QrcodeOutlined />}>
        QR Code
      </Button>
    </Popconfirm>
  );

  const tabItems = [
    {
      key: "1",
      label: "Details",
      children: (
        <>
          {/* KPI strip with period filter */}
          <div className="mb-2 flex justify-start">
            <Segmented
              size="small"
              value={statsPeriod}
              onChange={setStatsPeriod}
              options={[
                { label: "All time", value: "all" },
                { label: "Last 30 days", value: "30d" },
                { label: "Last 7 days", value: "7d" },
              ]}
            />
          </div>
          <Row gutter={[14, 14]}>
            <Col xs={24} sm={12} xl={6}>
              <KpiTile
                title="Total kms driven"
                tip="Total distance travelled (all time)"
                value={kpis.distanceKm.toFixed(1)}
                suffix="kms"
                since={statsPeriodLabel}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <KpiTile
                title="Energy Discharged"
                tip="Total energy consumed (all time) — energy used while driving."
                value={kpis.energyUsed.toFixed(2)}
                suffix="kWh"
                since={statsPeriodLabel}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <KpiTile
                title="Energy Charged"
                tip={
                  avgCostPerKwh
                    ? `Energy delivered during charging. Avg cost: ₹${avgCostPerKwh.toFixed(2)}/km`
                    : "Total energy charged (all time) — energy delivered during charging."
                }
                value={kpis.energyCharged.toFixed(2)}
                suffix="kWh"
                since={statsPeriodLabel}
              />
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <KpiTile
                title="Charging Sessions"
                tip="Total charging sessions (all time)."
                value={kpis.sessionCount.toFixed(0)}
                since={statsPeriodLabel}
              />
            </Col>
          </Row>

          {/* Live strip: Map (left) + Battery (right) */}
          <Row gutter={[16, 16]} style={{ marginTop: 16, alignItems: "stretch" }}>
            <Col xs={24} lg={9} style={{ display: "flex" }}>
              <MapCard vehicle={vehicle} />
            </Col>
            <Col xs={24} lg={15} style={{ display: "flex" }}>
              <BatteryStatusCard
                vehicle={vehicle}
                onEditSocLimit={() => setOpenEditVehicleModal(true)}
              />
            </Col>
          </Row>

          {/* Vehicle specs (full-width, reference data) */}
          <div className="mb-4 mt-4">
            <SpecsCard vehicle={vehicle} />
          </div>
        </>
      ),
    },
    {
      key: "2",
      label: "Analytics",
      children: <VehicleAnalytics vehicle={vehicle} />,
    },
    {
      key: "3",
      label: "Charging Sessions",
      children: <VehicleSessionsTable vehicle={vehicle} />,
    },
    {
      key: "5",
      label: "Documents",
      children: <DocumentsTab vehicle={vehicle} />,
    },
    {
      key: "6",
      label: "Check-In Logs",
      children: <CheckinLogsTab vehicle={vehicle} />,
    },
  ];

  return (
    <div style={{ marginLeft: 16, marginRight: 16 }}>
      <PulseKeyframes />

      <div className="mb-2 flex items-center gap-1.5 text-[12px] text-gray-400">
        <button
          type="button"
          onClick={() => router.push("/home")}
          className="cursor-pointer border-0 bg-transparent p-0 text-gray-500 transition-colors hover:text-orange-500"
          style={{ color: "#64748b" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f97417")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
        >
          Home
        </button>
        <span>/</span>
        <span className="font-medium text-gray-700">{vehicle.reg || "…"}</span>
      </div>

      <VehicleHeader vehicle={vehicle} driver={driver} qrCodeSlot={qrCodeButton} />

      <Tabs
        activeKey={activeTabKey}
        onTabClick={(key) => setActiveTabKey(key)}
        items={tabItems}
      />

      <EditSocLimitModal
        open={openEditVehicleModal}
        vehicle={vehicle}
        handleOpen={setOpenEditVehicleModal}
      />
    </div>
  );
}
