"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, DatePicker, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { downloadCsv } from "@/components/charging-sessions/sessionUtils";
import {
  fmtDateTime,
  getDurationString,
  hashId,
} from "@/components/vehicles/detail/vehicleDetailUtils";
import { useDb } from "@/data/store";
import type { Driver } from "@/data/types";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { Text } = Typography;
const { RangePicker } = DatePicker;

interface DriverCheckinLog {
  id: string;
  evId: string | null;
  evReg: string;
  checkinTime: string;
  checkoutTime: string | null;
}

// Check-In Logs tab for a driver — production renders VehicleCheckinList
// with filterBy="DRIVER" (same table, but with a Vehicle column instead of
// Driver). The sandbox derives the logs deterministically from the
// driver's trips, mirroring the vehicle CheckinLogsTab derivation.
export default function DriverCheckinLogs({ driver }: { driver: Driver }) {
  const db = useDb();
  const [limit] = useState(20);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  // Default to last 2 days, like production
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(2, "day"), dayjs()]);

  const logs = useMemo(() => {
    const regToVehicle = new Map(db.vehicles.map((v) => [v.reg, v]));
    const trips = db.trips.filter((t) => t.driverName === driver.name);
    const derived: DriverCheckinLog[] = trips.map((t, idx) => {
      const h = hashId(t.id);
      const checkin = dayjs(t.startTime).subtract(3 + (h % 15), "minute");
      const checkout = dayjs(t.endTime).add(2 + (h % 10), "minute");
      return {
        id: `chk-${driver.id.replace(/\D/g, "")}${String(idx + 1).padStart(3, "0")}`,
        evId: regToVehicle.get(t.vehicleReg)?.id ?? null,
        evReg: t.vehicleReg,
        checkinTime: checkin.toISOString(),
        checkoutTime: checkout.toISOString(),
      };
    });
    // Keep the latest log open while the driver's vehicle is being driven.
    const activeVehicle = db.vehicles.find(
      (v) =>
        (driver.vehicleReg !== null && v.reg === driver.vehicleReg) || v.driverId === driver.id,
    );
    if (activeVehicle?.status === "Driving" && derived.length > 0) {
      const openIdx = derived.findIndex((l) => l.evReg === activeVehicle.reg);
      if (openIdx !== -1) derived[openIdx] = { ...derived[openIdx], checkoutTime: null };
    }
    return derived.filter(
      (l) =>
        !dayjs(l.checkinTime).isBefore(range[0].startOf("day")) &&
        !dayjs(l.checkinTime).isAfter(range[1].endOf("day")),
    );
  }, [db.trips, db.vehicles, driver, range]);

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setRange([dates[0], dates[1]]);
    } else {
      setRange([dayjs().subtract(2, "day"), dayjs()]);
    }
    setCurrentPageNumber(1);
  };

  function downloadCheckinListsAsExcel() {
    downloadCsv(
      `checkin-sessions-${driver.id}.csv`,
      ["Id", "Vehicle", "Check-in Time", "Check-out Time", "Duration"],
      logs.map((l) => [
        l.id,
        l.evReg,
        fmtDateTime(l.checkinTime),
        l.checkoutTime ? fmtDateTime(l.checkoutTime) : "Currently using",
        l.checkoutTime
          ? getDurationString(l.checkinTime, l.checkoutTime)
          : getDurationString(l.checkinTime, new Date().toISOString()),
      ]),
    );
  }

  const columns: TableProps<DriverCheckinLog>["columns"] = [
    {
      title: "Id",
      dataIndex: "id",
      key: "id",
      sorter: (a, b) => a.id.localeCompare(b.id),
    },
    {
      title: "Vehicle",
      dataIndex: "vehicle",
      key: "vehicle",
      render: (_, log) =>
        log.evId ? (
          <Link href={`/vehicles/${log.evId}`}>
            <Text style={{ color: "#f97417" }}>{log.evReg}</Text>
          </Link>
        ) : (
          <Text style={{ color: "#f97417" }}>{log.evReg}</Text>
        ),
    },
    {
      title: "Check-in Time",
      dataIndex: "checkinTime",
      key: "checkinTime",
      sorter: (a, b) => dayjs(a.checkinTime).valueOf() - dayjs(b.checkinTime).valueOf(),
      render: (_, log) => <>{fmtDateTime(log.checkinTime)}</>,
    },
    {
      title: "Check-out Time",
      dataIndex: "checkoutTime",
      key: "checkoutTime",
      sorter: (a, b) => dayjs(a.checkoutTime ?? 0).valueOf() - dayjs(b.checkoutTime ?? 0).valueOf(),
      render: (_, log) => (
        <>{log.checkoutTime ? fmtDateTime(log.checkoutTime) : <Tag color="green">Currently using</Tag>}</>
      ),
    },
    {
      title: "Duration",
      dataIndex: "duration",
      key: "duration",
      render: (_, log) => (
        <>
          {log.checkoutTime !== null
            ? getDurationString(log.checkinTime, log.checkoutTime)
            : getDurationString(log.checkinTime, new Date().toISOString())}
        </>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex w-full items-center justify-between">
        <RangePicker value={range} onChange={handleDateChange} format={DATE_FORMAT} />

        <Button
          type="primary"
          icon={<DownloadOutlined />}
          size="middle"
          onClick={downloadCheckinListsAsExcel}
          disabled={!logs.length}
        >
          Export as Excel
        </Button>
      </div>

      <Table<DriverCheckinLog>
        columns={columns}
        dataSource={logs}
        rowKey="id"
        size="small"
        bordered
        rowClassName={() => "custom-table-row"}
        className="styled-drivers-table"
        pagination={{
          pageSize: limit,
          total: logs.length,
          current: currentPageNumber,
          onChange: (page) => setCurrentPageNumber(page),
          showSizeChanger: false,
          showTotal: (total, r) => `${r[0]}-${r[1]} of ${total} trips`,
        }}
      />
    </>
  );
}
