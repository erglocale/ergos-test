"use client";

import { Card, DatePicker, Input, Select, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HiCheckBadge, HiMiniBellAlert } from "react-icons/hi2";
import {
  chargerWarningTypeOptions,
  rangePresets,
  warningStatusOptions,
} from "@/components/home/FleetAndChargerHostLayout";
import { useDb } from "@/data/store";
import type { ChargerWarning } from "@/data/types";
import { fmtDateTime } from "./alertUtils";

const splitCamelCaseAndUppercase = (str?: string | null) => {
  if (!str) return "";
  return str.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
};

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

const { Text } = Typography;
const { RangePicker } = DatePicker;
const { Search } = Input;

// Production's Type filter values ("Downtime" / "ConnectorFault") map to
// these warning-object types server-side.
const WARNING_TYPE_MAP: Record<string, ChargerWarning["warningObject"]["type"]> = {
  Downtime: "ChargerOffline",
  ConnectorFault: "ConnectorFaulted",
};

export default function ChargerWarnings() {
  const router = useRouter();
  const db = useDb();
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [startDate, setStartDate] = useState(() =>
    dayjs().subtract(2, "day").startOf("day").toISOString(),
  );
  const [endDate, setEndDate] = useState(() => dayjs().toISOString());
  const [limit] = useState(10);
  const [chargerWarningsQueryStatus, setChargerWarningsQueryStatus] = useState("All");
  const [chargerWarningsType, setChargerWarningsType] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

  // Debouncing search text
  useEffect(() => {
    // Set a timer to update the query state after 500ms
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 700);

    // Clean up the timer if the user types again before 500ms
    return () => clearTimeout(timer);
  }, [searchText]);

  // Store-backed replica of useChargersWarnings (status, type, date window
  // and search are query params in production).
  const chargerWarnings = useMemo(() => {
    const start = dayjs(startDate).startOf("day");
    const end = dayjs(endDate).endOf("day");
    const search = debouncedSearchText.trim().toLowerCase();
    return db.chargerWarnings.filter((w) => {
      const t = dayjs(w.warningObject.createdAt);
      if (t.isBefore(start) || t.isAfter(end)) return false;
      if (
        chargerWarningsQueryStatus !== "All" &&
        w.warningObject.status !== chargerWarningsQueryStatus
      )
        return false;
      if (
        chargerWarningsType !== "ALL" &&
        w.warningObject.type !== WARNING_TYPE_MAP[chargerWarningsType]
      )
        return false;
      if (
        search &&
        !w.charger.name.toLowerCase().includes(search) &&
        !w.charger.id.toLowerCase().includes(search) &&
        !w.warningObject.type.toLowerCase().includes(search)
      )
        return false;
      return true;
    });
  }, [
    db.chargerWarnings,
    startDate,
    endDate,
    chargerWarningsQueryStatus,
    chargerWarningsType,
    debouncedSearchText,
  ]);

  const columns: TableProps<ChargerWarning>["columns"] = [
    {
      title: "Charger",
      key: "charger",
      width: 220,
      render: (_, record) => {
        const address = db.chargepoints.find((c) => c.id === record.charger.id)?.address;
        return (
          <div
            style={{ cursor: "pointer" }}
            onClick={() => {
              if (record?.charger?.id) router.push(`/chargingStations/${record.charger.id}`);
            }}
          >
            <Text strong ellipsis={{ tooltip: record?.charger?.name }}>
              {record?.charger?.name || "N/A"}
            </Text>
            <br />
            <Text type="secondary">{record?.charger?.id || "No ID"}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: "11px" }} ellipsis={{ tooltip: address }}>
              {address || "No Address"}
            </Text>
          </div>
        );
      },
    },
    {
      title: "Warning Type",
      dataIndex: ["warningObject", "type"],
      key: "warningType",
      width: 180,
      render: (type: string) => (
        <Tag color="volcano">{splitCamelCaseAndUppercase(type || "Unknown")}</Tag>
      ),
    },
    {
      title: "Details",
      key: "details",
      render: (_, record) => {
        const isDowntime = record?.warningObject?.offlineForHours != null;
        const isConnectorFault = record?.connector != null;
        if (isDowntime) {
          return (
            <Text type="danger">
              Offline for last{" "}
              {Math.round(Number(record.warningObject.offlineForHours)) || "N/A"} hours
            </Text>
          );
        } else if (isConnectorFault) {
          return (
            <>
              <Text type="danger">
                Connector {record.connector!.connectorId || "N/A"} is in{" "}
                {record.connector!.status || "Unknown"} status for{" "}
                {record.connector!.updatedAt
                  ? dayjs(record.connector!.updatedAt).fromNow(true)
                  : "N/A"}
              </Text>
              <br />
              <Text style={{ color: "#0284c7", fontSize: "11px" }}>
                Last status received:{" "}
                {record.connector!.updatedAt
                  ? dayjs(record.connector!.updatedAt).format("lll")
                  : "N/A"}
              </Text>
            </>
          );
        } else {
          return <Text type="secondary">No specific details available.</Text>;
        }
      },
    },
    {
      title: "Timeline",
      dataIndex: ["warningObject", "createdAt"],
      key: "triggeredAt",
      render: (_, record) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <HiMiniBellAlert className="h-5 w-5" color="#aa7714" /> Triggered at{" "}
            {fmtDateTime(record?.warningObject?.createdAt)}
          </div>

          {record?.warningObject?.status === "Fixed" && (
            <div className="flex items-center gap-1">
              <HiCheckBadge className="h-5 w-5" color="#22c063" /> Resolved at{" "}
              {/* lastChecked stands in for production's warningObject.updatedAt */}
              {fmtDateTime(record?.warningObject?.lastChecked)}
            </div>
          )}
        </div>
      ),
    },
    // Production's Actions column (ignore / resolve dropdown) is commented
    // out in the source — intentionally not rendered here either.
  ];

  useEffect(() => {
    setCurrentPageNumber(1);
  }, [startDate, endDate, chargerWarningsQueryStatus, debouncedSearchText]);

  return (
    <>
      <div
        className="flex w-full items-center justify-start gap-4"
        style={{
          marginBottom: "16px",
          marginTop: "0px",
        }}
      >
        <RangePicker
          style={{ width: "600px" }}
          presets={rangePresets}
          value={[dayjs(startDate), dayjs(endDate)]}
          onChange={(value) => {
            if (value && value[0] && value[1]) {
              setStartDate(value[0].toISOString());
              setEndDate(value[1].toISOString());
            }
          }}
          format="DD MMM YYYY"
          allowClear={false}
        />

        <Search
          placeholder="Search warnings..."
          allowClear
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: "100%" }}
        />
        <div className="flex items-center justify-start gap-2">
          <Text className="whitespace-nowrap">Status:</Text>
          <Select
            style={{ width: 120 }}
            size="middle"
            value={chargerWarningsQueryStatus}
            placeholder="Status"
            onChange={setChargerWarningsQueryStatus}
            options={warningStatusOptions}
          />
        </div>

        <div className="flex items-center justify-start gap-2">
          <Text className="whitespace-nowrap">Type:</Text>
          <Select
            style={{ width: 200 }}
            size="middle"
            value={chargerWarningsType}
            placeholder="Type"
            onChange={setChargerWarningsType}
            options={chargerWarningTypeOptions}
          />
        </div>
      </div>

      <Card
        style={{
          width: "100%",
          borderRadius: "12px",
          boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          border: "1px solid #f0f0f0",
        }}
        styles={{ body: { padding: 0 } }}
        hoverable
      >
        <Table<ChargerWarning>
          columns={columns}
          dataSource={chargerWarnings}
          rowKey="id"
          pagination={{
            pageSize: limit,
            total: chargerWarnings.length,
            current: currentPageNumber,
            onChange: (page) => {
              setCurrentPageNumber(page);
            },
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} warnings`,
            position: ["bottomCenter"],
          }}
          scroll={{ x: "max-content" }}
          bordered={false}
          rowClassName={() => "custom-table-row"}
          className="styled-warnings-table"
        />
      </Card>
    </>
  );
}
