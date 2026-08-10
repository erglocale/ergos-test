"use client";

import { DownloadOutlined } from "@ant-design/icons";
import { Button, Card, DatePicker, Select, Table, Tag, Typography } from "antd";
import type { TableProps } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Trip } from "@/data/types";
import { fmtDateTime, tripAddresses } from "./tripUtils";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { Text } = Typography;
const { RangePicker } = DatePicker;

function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TripsList() {
  const db = useDb();
  const [limit] = useState(14);
  const [currentPageNumber, setCurrentPageNumber] = useState(1);
  const [vehicleNumberPlates, setVehicleNumberPlates] = useState<string[]>([]);

  const [internalRange, setInternalRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, "day"), dayjs()]);

  const numberPlateOptions = useMemo(
    () =>
      db.vehicles
        .filter((v) => v.reg)
        .map((v) => ({ label: v.reg, value: v.reg }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [db.vehicles],
  );

  const hubOptions = useMemo(() => {
    const hubs = [...new Set(db.vehicles.map((v) => v.hub))];
    return hubs.map((h) => ({ label: h, value: h }));
  }, [db.vehicles]);

  const [hubQuickFilter, setHubQuickFilter] = useState<string | null>(null);
  const handleHubQuickSelect = (hub: string | null | undefined) => {
    setHubQuickFilter(hub ?? null);
    if (!hub) {
      setVehicleNumberPlates([]);
      return;
    }
    setVehicleNumberPlates(db.vehicles.filter((v) => v.hub === hub).map((v) => v.reg));
  };

  const handleDateChange: React.ComponentProps<typeof RangePicker>["onChange"] = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setInternalRange([dates[0], dates[1]]);
    } else {
      setInternalRange([dayjs().subtract(10, "day"), dayjs()]);
    }
  };

  const trips = useMemo(() => {
    const [start, end] = internalRange;
    return db.trips.filter((t) => {
      const st = dayjs(t.startTime);
      if (st.isBefore(start.startOf("day")) || st.isAfter(end.endOf("day"))) return false;
      if (vehicleNumberPlates.length && !vehicleNumberPlates.includes(t.vehicleReg)) return false;
      return true;
    });
  }, [db.trips, internalRange, vehicleNumberPlates]);

  function downloadTripsAsExcel() {
    downloadCsv(
      `trips-${internalRange[0].format("YYYY-MM-DD")}-${internalRange[1].format("YYYY-MM-DD")}.csv`,
      [
        "Trip Id",
        "Vehicle",
        "Starting battery (%)",
        "Ending battery (%)",
        "Energy discharged (kWh)",
        "Started at",
        "Ended at",
        "Distance (km)",
        "Driver",
      ],
      trips.map((t) => [
        t.id,
        t.vehicleReg,
        t.startSoc,
        t.endSoc,
        t.energyKwh,
        fmtDateTime(t.startTime),
        fmtDateTime(t.endTime),
        t.distanceKm,
        t.driverName,
      ]),
    );
  }

  const listCols: TableProps<Trip>["columns"] = [
    {
      title: "Id",
      dataIndex: "id",
      key: "trip_id",
      width: 100,
      render: (_, trip) => (
        <Link href={`/trips/${trip.id}`}>
          <Text style={{ color: "#f97417" }}>{trip.id}</Text>
        </Link>
      ),
    },
    {
      title: "Trip vehicle",
      dataIndex: "vehicleReg",
      key: "tripVehicle",
      width: 180,
      render: (_, trip) => `${trip.vehicleReg}`,
    },
    {
      title: "Starting battery (%)",
      dataIndex: "startSoc",
      key: "starting_soc",
      width: 170,
      render: (_, trip) => `${Number(trip.startSoc).toFixed(2)} %`,
    },
    {
      title: "Ending battery (%)",
      dataIndex: "endSoc",
      key: "ending_soc",
      width: 170,
      render: (_, trip) =>
        trip.endSoc != null ? `${Number(trip.endSoc).toFixed(2)} %` : <Tag color="green">Ongoing</Tag>,
    },
    {
      title: "Energy discharged",
      dataIndex: "energyKwh",
      key: "soc_used",
      width: 170,
      sorter: (a, b) => a.energyKwh - b.energyKwh,
      render: (_, trip) => `${trip.energyKwh.toFixed(3)} kWh`,
    },
    {
      title: "Trip started at",
      dataIndex: "startTime",
      key: "start_time",
      width: 200,
      sorter: (a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf(),
      render: (_, trip) => fmtDateTime(trip.startTime),
    },
    {
      title: "Trip ended at",
      dataIndex: "endTime",
      key: "end_time",
      width: 200,
      sorter: (a, b) => dayjs(a.endTime).valueOf() - dayjs(b.endTime).valueOf(),
      render: (_, trip) => (trip.endTime ? fmtDateTime(trip.endTime) : <Tag color="green">Ongoing</Tag>),
    },
    {
      title: "Distance covered",
      dataIndex: "distanceKm",
      key: "distance_travelled_th_3",
      width: 150,
      sorter: (a, b) => a.distanceKm - b.distanceKm,
      render: (_, trip) =>
        trip.endTime ? `${trip.distanceKm.toFixed(2)} kms` : <Tag color="green">Ongoing</Tag>,
    },
    {
      title: "Driver",
      dataIndex: "driverName",
      key: "driver",
      width: 200,
      render: (_, trip) =>
        trip.driverName && trip.driverName !== "—" ? trip.driverName : <Tag color="gray">UNKNOWN</Tag>,
    },
    {
      title: "Starting point",
      dataIndex: "start_address",
      key: "start_address",
      width: 350,
      render: (_, trip) => {
        const { startAddress } = tripAddresses(trip);
        return (
          <Text style={{ width: 300 }} ellipsis={{ tooltip: startAddress }}>
            {startAddress}
          </Text>
        );
      },
    },
    {
      title: "Ending point",
      dataIndex: "end_address",
      key: "end_address",
      width: 350,
      render: (_, trip) => {
        const { endAddress } = tripAddresses(trip);
        return (
          <Text style={{ width: 300 }} ellipsis={{ tooltip: endAddress }}>
            {endAddress}
          </Text>
        );
      },
    },
  ];

  useEffect(() => {
    setCurrentPageNumber(1);
  }, [internalRange, vehicleNumberPlates]);

  return (
    <>
      <div className="mb-4 flex justify-between gap-2">
        <div className="flex gap-2" style={{ flex: 1, maxWidth: 640 }}>
          <Select
            value={hubQuickFilter}
            onChange={handleHubQuickSelect}
            placeholder="Hub"
            style={{ width: 140, minWidth: 140 }}
            options={hubOptions}
            allowClear
          />
          <Select
            mode="multiple"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="Filter by number plate"
            value={vehicleNumberPlates}
            onChange={setVehicleNumberPlates}
            options={numberPlateOptions}
            allowClear
            maxTagCount="responsive"
            showSearch
            filterOption={(input, option) =>
              (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            size="middle"
            onClick={downloadTripsAsExcel}
            disabled={!trips.length}
          >
            Export as Excel
          </Button>
          <RangePicker value={internalRange} onChange={handleDateChange} format={DATE_FORMAT} />
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
        <Table<Trip>
          columns={listCols}
          dataSource={trips}
          rowKey="id"
          size="large"
          pagination={{
            pageSize: limit,
            total: trips.length,
            current: currentPageNumber,
            onChange: (page) => setCurrentPageNumber(page),
            showSizeChanger: false,
            showTotal: (total, r) => `${r[0]}-${r[1]} of ${total} trips`,
          }}
          scroll={{ x: "max-content", y: "70vh" }}
          bordered={false}
          rowClassName={() => "custom-table-row"}
          className="styled-drivers-table"
        />
      </Card>
    </>
  );
}
