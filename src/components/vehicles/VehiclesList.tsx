"use client";

import { Button, Card, Popconfirm, Space, Table, Tag, Tooltip } from "antd";
import type { TableColumnsType } from "antd";
import { useState } from "react";
import { FaHistory } from "react-icons/fa";
import { FiCheckCircle, FiClock, FiRadio, FiSlash, FiXOctagon } from "react-icons/fi";
import getDocumentSummaryByEntity from "@/components/drivers/documents";
import { removeRow, useDb } from "@/data/store";
import type { Vehicle } from "@/data/types";
import EditVehicleModal from "./EditVehicleModal";
import { message } from "@/lib/antdStatic";

// Color-coded SoC battery bar — 10 segments from red to green
const SOC_COLORS = [
  "#ef4444",
  "#f97316",
  "#f97316",
  "#eab308",
  "#eab308",
  "#84cc16",
  "#84cc16",
  "#22c55e",
  "#22c55e",
  "#16a34a",
];

const sanitizeSoc = (soc: number) =>
  Math.max(0, Math.min(100, Math.round(Number(soc) || 0)));

function SocBar({ percent }: { percent: number }) {
  const soc = sanitizeSoc(percent);
  const filledSegments = Math.round(soc / 10);

  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 12,
            height: 16,
            borderRadius: 2,
            backgroundColor: i < filledSegments ? SOC_COLORS[i] : "#f1f5f9",
            transition: "background-color 0.3s",
          }}
        />
      ))}
      <span
        style={{
          marginLeft: 8,
          fontWeight: 700,
          fontSize: 14,
          color: "#1e293b",
          minWidth: 48,
        }}
      >
        {soc}%
      </span>
    </div>
  );
}

const statusTagStyle: React.CSSProperties = {
  fontWeight: 600,
  borderRadius: 20,
  padding: "2px 12px",
  border: "none",
  fontSize: 12,
};

function StatusTag({ vehicle }: { vehicle: Vehicle }) {
  if (vehicle.status === "Offline") {
    return (
      <Tag style={statusTagStyle} color="default">
        Disabled
      </Tag>
    );
  }
  if (vehicle.status === "Charging") {
    return (
      <Tag style={statusTagStyle} color="green">
        Charging
      </Tag>
    );
  }
  if (vehicle.status === "Driving") {
    return (
      <Tag style={statusTagStyle} color="blue">
        Running
      </Tag>
    );
  }
  return (
    <Tag style={statusTagStyle} color="orange">
      Idle
    </Tag>
  );
}

// Deterministic "telemetry updated n minutes ago" stand-in (fixtures carry no
// telemetry timestamps).
const fakeUpdatedMinutes = (id: string) => {
  const n = Number(id.replace(/^\D+/, "")) || 1;
  return ((n * 7) % 55) + 2;
};

export default function VehiclesList({
  vehicles,
  isLoading,
}: {
  vehicles: Vehicle[];
  isLoading?: boolean;
}) {
  const db = useDb();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [openEditVehicleModal, setOpenEditVehicleModal] = useState(false);

  const driverName = (driverId: string | null) => {
    if (!driverId) return null;
    return db.drivers.find((d) => d.id === driverId)?.name ?? null;
  };

  const columns: TableColumnsType<Vehicle> = [
    {
      title: "Vehicle no.",
      dataIndex: "reg",
      key: "reg",
      width: 280,
      sorter: (a, b) => (a.reg || "").localeCompare(b.reg || ""),
      render: (text: string, vehicle) => {
        const telematicsDeviceEnabled = vehicle.status !== "Offline";
        const isRunning = vehicle.status === "Driving";
        const name = driverName(vehicle.driverId);
        return (
          <div>
            <span
              style={{
                color: "#f97417",
                fontWeight: 700,
                fontSize: 15,
              }}
            >
              {text}
            </span>

            {!telematicsDeviceEnabled ? (
              <p className="mt-1 flex text-xs text-gray-400">
                <FiSlash className="mr-1 h-4 w-4" /> Vehicle details not available
              </p>
            ) : (
              <>
                {name === null && isRunning && (
                  <p className="mt-1 flex text-xs font-semibold text-green-600">
                    <FiRadio className="mr-1 h-4 w-4" /> Currently used by unknown
                    driver
                  </p>
                )}

                {name === null && !isRunning && (
                  <p className="mt-1 flex items-center text-xs text-gray-400">
                    <FiSlash className="mr-1 h-3 w-3" /> Vehicle is not used
                  </p>
                )}

                {name !== null && !isRunning && (
                  <p className="mt-1 flex text-xs text-gray-400">
                    <FaHistory className="mr-1 h-4 w-4" /> Last known driver: {name}
                  </p>
                )}

                {name !== null && isRunning && (
                  <p className="mt-1 flex text-xs font-semibold text-green-600">
                    <FiRadio className="mr-1 h-4 w-4" /> Currently used by {name}
                  </p>
                )}

                {vehicle.model && (
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: 12,
                      color: "#94a3b8",
                    }}
                  >
                    {vehicle.model}
                  </p>
                )}
              </>
            )}
          </div>
        );
      },
    },
    {
      title: "Current SoC",
      dataIndex: "soc",
      key: "soc",
      width: 260,
      sorter: (a, b) => sanitizeSoc(a.soc) - sanitizeSoc(b.soc),
      render: (text: number, vehicle) => (
        <>
          {vehicle.status === "Offline" ? (
            <Tag style={{ borderRadius: 20, fontSize: 12 }} color="default">
              Not available
            </Tag>
          ) : (
            <div>
              <SocBar percent={text} />
              <p
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#94a3b8",
                }}
              >
                Updated {fakeUpdatedMinutes(vehicle.id)} minutes ago
              </p>
            </div>
          )}
        </>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      filters: [
        { text: "Charging", value: "charging" },
        { text: "Running", value: "running" },
        { text: "Idle", value: "idle" },
      ],
      onFilter: (value, record) => {
        if (value === "charging") return record.status === "Charging";
        if (value === "running") return record.status === "Driving";
        return record.status !== "Charging" && record.status !== "Driving";
      },
      render: (_: unknown, vehicle) => <StatusTag vehicle={vehicle} />,
    },
    {
      title: "Documents",
      dataIndex: "documents",
      key: "documents",
      width: 180,
      render: (_: unknown, vehicle) => {
        const documentSummary = getDocumentSummaryByEntity(vehicle.id);
        return (
          <div className="flex flex-wrap items-center gap-1">
            {documentSummary.verified > 0 && (
              <Tooltip title={`Verified: ${documentSummary.verified}`}>
                <div className="flex items-center gap-1 rounded-md bg-green-50 px-2 py-1">
                  <FiCheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs font-bold text-green-700">
                    {documentSummary.verified}
                  </span>
                </div>
              </Tooltip>
            )}
            {documentSummary.pending > 0 && (
              <Tooltip title={`Pending: ${documentSummary.pending}`}>
                <div className="flex items-center gap-1 rounded-md bg-yellow-50 px-2 py-1">
                  <FiClock className="h-3.5 w-3.5 text-yellow-500" />
                  <span className="text-xs font-bold text-yellow-700">
                    {documentSummary.pending}
                  </span>
                </div>
              </Tooltip>
            )}
            {documentSummary.rejected > 0 && (
              <Tooltip title={`Rejected: ${documentSummary.rejected}`}>
                <div className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1">
                  <FiXOctagon className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-xs font-bold text-red-700">
                    {documentSummary.rejected}
                  </span>
                </div>
              </Tooltip>
            )}
            <div className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1">
              <span className="text-xs text-gray-500">
                Total: {documentSummary.total || 0}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_: unknown, vehicle) => (
        <Space>
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedVehicle(vehicle);
              setOpenEditVehicleModal(true);
            }}
          >
            Edit
          </Button>
          <Popconfirm
            title={`Delete vehicle ${vehicle.reg}?`}
            description="This will remove the vehicle from the sandbox store."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              removeRow("vehicles", vehicle.id);
              message.success("Vehicle deleted!");
            }}
          >
            <Button size="small" danger onClick={(e) => e.stopPropagation()}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        style={{
          borderRadius: 12,
          border: "1px solid #f0f0f0",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={vehicles}
          loading={isLoading}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} of ${total} vehicles`,
          }}
          scroll={{ x: 840 }}
          bordered={false}
          rowKey="id"
          rowClassName={(record) =>
            record.status === "Offline"
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer"
          }
          style={{ borderRadius: 12 }}
        />
      </Card>

      <EditVehicleModal
        vehicle={selectedVehicle}
        isModalOpen={openEditVehicleModal}
        handleModalVisibility={setOpenEditVehicleModal}
      />
    </>
  );
}
