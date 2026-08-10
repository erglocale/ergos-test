"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, DatePicker, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { downloadCsv } from "@/components/charging-sessions/sessionUtils";
import { useDb } from "@/data/store";
import type { Vehicle } from "@/data/types";
import {
  deriveCheckins,
  fmtDateTime,
  getDurationString,
  type CheckinLog,
} from "./vehicleDetailUtils";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Check-In Logs tab — production lists check-in sessions from the API; the
// sandbox derives them deterministically from the vehicle's trips.
export default function CheckinLogsTab({ vehicle }: { vehicle: Vehicle }) {
  const db = useDb();
  const [limit] = useState(20);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  // Default to last 2 days, like production
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(2, "day"), dayjs()]);

  const logs = useMemo(() => {
    const trips = db.trips.filter((t) => t.vehicleReg === vehicle.reg);
    return deriveCheckins(trips, vehicle).filter(
      (l) =>
        !dayjs(l.checkinTime).isBefore(range[0].startOf("day")) &&
        !dayjs(l.checkinTime).isAfter(range[1].endOf("day")),
    );
  }, [db.trips, vehicle, range]);

  const driverIdByName = useMemo(() => {
    const map = new Map<string, string>();
    db.drivers.forEach((d) => map.set(d.name, d.id));
    return map;
  }, [db.drivers]);

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
      `checkin-sessions-${vehicle.reg}.csv`,
      ["Id", "Driver", "Check-in Time", "Check-out Time", "Duration"],
      logs.map((l) => [
        l.id,
        l.driverName,
        fmtDateTime(l.checkinTime),
        l.checkoutTime ? fmtDateTime(l.checkoutTime) : "Currently using",
        l.checkoutTime
          ? getDurationString(l.checkinTime, l.checkoutTime)
          : getDurationString(l.checkinTime, new Date().toISOString()),
      ]),
    );
  }

  const columns: TableProps<CheckinLog>["columns"] = [
    {
      title: "Id",
      dataIndex: "id",
      key: "id",
      sorter: (a, b) => a.id.localeCompare(b.id),
    },
    {
      title: "Driver",
      dataIndex: "driver",
      key: "driver",
      render: (_, log) => {
        const driverId = driverIdByName.get(log.driverName);
        return driverId ? (
          <Link href={`/drivers/${driverId}`}>
            <Text style={{ color: "#f97417" }}>{log.driverName}</Text>
          </Link>
        ) : (
          <Text style={{ color: "#f97417" }}>{log.driverName}</Text>
        );
      },
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

      <Table<CheckinLog>
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
