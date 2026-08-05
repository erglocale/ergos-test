"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import { Button, Card, DatePicker, Input, message, Modal, Select, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { HiCheckBadge, HiMiniBellAlert } from "react-icons/hi2";
import { updateRow, useDb } from "@/data/store";
import type { Alert } from "@/data/types";
import { fmtDateTime, isVehicleAlert, rangePresets } from "./alertUtils";

const { Text } = Typography;
const { confirm } = Modal;
const { RangePicker } = DatePicker;
const { Search } = Input;

const warningStatusOptions = [
  { value: "All", label: "All" },
  { value: "New", label: "New" },
  { value: "Fixed", label: "Resolved" },
];

export default function ChargerWarningsList() {
  const db = useDb();
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(2, "day").startOf("day"), dayjs()]);
  const [limit] = useState(10);
  const [chargerWarningsQueryStatus, setChargerWarningsQueryStatus] = useState("All");
  const [chargerWarningsType, setChargerWarningsType] = useState("ALL");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText, setDebouncedSearchText] = useState("");

  // Debouncing search text (same as production)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 700);
    return () => clearTimeout(timer);
  }, [searchText]);

  const chargerAlerts = useMemo(() => db.alerts.filter((a) => !isVehicleAlert(a)), [db.alerts]);

  const typeOptions = useMemo(() => {
    const types = new Set(chargerAlerts.map((a) => a.type));
    return [{ label: "All", value: "ALL" }, ...[...types].sort().map((t) => ({ label: t, value: t }))];
  }, [chargerAlerts]);

  const warnings = useMemo(() => {
    const [start, end] = range;
    const search = debouncedSearchText.trim().toLowerCase();
    return chargerAlerts.filter((a) => {
      const t = dayjs(a.time);
      if (t.isBefore(start) || t.isAfter(end.endOf("day"))) return false;
      if (chargerWarningsQueryStatus === "New" && a.acknowledged) return false;
      if (chargerWarningsQueryStatus === "Fixed" && !a.acknowledged) return false;
      if (chargerWarningsType !== "ALL" && a.type !== chargerWarningsType) return false;
      if (
        search &&
        !a.message.toLowerCase().includes(search) &&
        !a.source.toLowerCase().includes(search) &&
        !a.type.toLowerCase().includes(search)
      )
        return false;
      return true;
    });
  }, [chargerAlerts, range, chargerWarningsQueryStatus, chargerWarningsType, debouncedSearchText]);

  const showResolveConfirm = (warning: Alert) => {
    confirm({
      title: "Are you sure you want to mark this warning as resolved?",
      icon: <ExclamationCircleFilled />,
      content:
        "If continued, this warning will be marked as resolved. You can find all the resolved warnings in the Resolved Warnings section.",
      onOk: () => {
        updateRow("alerts", warning.id, { acknowledged: true });
        message.success("Warning marked as resolved!");
      },
      okText: "Yes, resolve",
      onCancel() {},
      width: 540,
    });
  };

  const columns: TableProps<Alert>["columns"] = [
    {
      title: "Charger",
      key: "charger",
      width: 220,
      render: (_, record) => {
        const cp = db.chargepoints.find((c) => c.name === record.source);
        return (
          <div style={{ cursor: "pointer" }}>
            <Text strong ellipsis={{ tooltip: record.source }}>
              {record.source || "N/A"}
            </Text>
            <br />
            <Text type="secondary">{cp?.id || "No ID"}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: "11px" }} ellipsis={{ tooltip: cp?.address }}>
              {cp?.address || "No Address"}
            </Text>
          </div>
        );
      },
    },
    {
      title: "Warning Type",
      dataIndex: "type",
      key: "warningType",
      width: 180,
      render: (type: string) => <Tag color="volcano">{type || "Unknown"}</Tag>,
    },
    {
      title: "Details",
      key: "details",
      render: (_, record) => (
        <Text type="danger" ellipsis={{ tooltip: record.message }}>
          {record.message || "No specific details available."}
        </Text>
      ),
    },
    {
      title: "Timeline",
      dataIndex: "time",
      key: "triggeredAt",
      render: (_, record) => (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <HiMiniBellAlert className="h-5 w-5" color="#aa7714" /> Triggered at {fmtDateTime(record.time)}
          </div>

          {record.acknowledged && (
            <div className="flex items-center gap-1">
              <HiCheckBadge className="h-5 w-5" color="#22c063" /> Resolved
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "center",
      width: 140,
      render: (_, record) =>
        record.acknowledged ? (
          <Tag color="green">Resolved</Tag>
        ) : (
          <Button size="small" onClick={() => showResolveConfirm(record)}>
            Mark as Resolved
          </Button>
        ),
    },
  ];

  useEffect(() => {
    setCurrentPageNumber(1);
  }, [range, chargerWarningsQueryStatus, debouncedSearchText]);

  return (
    <>
      <div
        className="flex w-full items-center justify-start gap-4"
        style={{ marginBottom: "16px", marginTop: "0px" }}
      >
        <RangePicker
          style={{ width: "600px" }}
          presets={rangePresets}
          value={range}
          onChange={(value) => {
            if (value && value[0] && value[1]) setRange([value[0], value[1]]);
          }}
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
            options={typeOptions}
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
        <Table<Alert>
          columns={columns}
          dataSource={warnings}
          rowKey="id"
          pagination={{
            pageSize: limit,
            total: warnings.length,
            current: currentPageNumber,
            onChange: (page) => setCurrentPageNumber(page),
            showTotal: (total, r) => `${r[0]}-${r[1]} of ${total} warnings`,
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
