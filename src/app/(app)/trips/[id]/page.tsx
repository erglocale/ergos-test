"use client";

import { Avatar, Divider, Empty, Tabs, Tag, Timeline, Tooltip, Typography } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { BsLightningChargeFill, BsSpeedometer } from "react-icons/bs";
import { GiPathDistance } from "react-icons/gi";
import { IoCarSport } from "react-icons/io5";
import { LuCalendarClock } from "react-icons/lu";
import { RiBattery2ChargeLine } from "react-icons/ri";
import {
  deriveTripMaxSpeed,
  deriveTripSocSeries,
  deriveTripSpeedSeries,
  fmtDateTime,
  getDurationString,
  tripAddresses,
} from "@/components/trips/tripUtils";
import TripRouteMap from "@/components/maps/TripRouteMap";
import { useDb } from "@/data/store";

const { Title } = Typography;

function lineChartOption(
  name: string,
  color: string,
  data: [number, number][],
  opts: { yMax?: number | "dataMax"; unit: string },
) {
  return {
    grid: { top: 30, right: 30, bottom: 70, left: 45 },
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: number) => `${Number(v).toFixed(2)} ${opts.unit}`,
    },
    legend: { bottom: 0, icon: "roundRect", itemWidth: 14, data: [name] },
    xAxis: {
      type: "time",
      axisLabel: { fontSize: 12, formatter: (val: number) => dayjs(val).format("h:mm A") },
      splitLine: { show: true, lineStyle: { type: "dashed", color: "#e0e0e0" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: opts.yMax ?? 100,
      splitLine: { lineStyle: { type: "dashed", color: "#e0e0e0" } },
    },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 18, bottom: 30 }],
    series: [
      {
        name,
        type: "line",
        showSymbol: false,
        lineStyle: { color, width: 1.5 },
        itemStyle: { color },
        data,
      },
    ],
  };
}

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const tripId = decodeURIComponent(params.id);
  const db = useDb();

  const trip = db.trips.find((t) => t.id === tripId);
  const vehicle = trip ? db.vehicles.find((v) => v.reg === trip.vehicleReg) : undefined;
  const driver = trip ? db.drivers.find((d) => d.name === trip.driverName) : undefined;

  const socSeries = useMemo(() => (trip ? deriveTripSocSeries(trip) : []), [trip]);
  const speedSeries = useMemo(() => (trip ? deriveTripSpeedSeries(trip) : []), [trip]);

  if (!trip) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Empty description={`Trip ${tripId} not found`} />
      </div>
    );
  }

  const { startAddress, endAddress } = tripAddresses(trip);
  const socUsed = trip.startSoc - trip.endSoc;
  const maxSpeed = deriveTripMaxSpeed(trip);
  const initials = driver
    ? driver.name
        .split(" ")
        .map((p) => p.charAt(0).toUpperCase())
        .slice(0, 2)
        .join("")
    : "UU";

  return (
    <div className="min-h-screen p-4">
      <div className="mb-2 flex items-center justify-between">
        <Title level={3} style={{ textAlign: "left" }} className="flex items-center">
          Trip Details - {tripId}
        </Title>
        <div className="flex flex-col items-end">
          <div className="flex items-center justify-end text-gray-600">
            <LuCalendarClock className="mr-2 h-4 w-4" />
            <p className="text-md font-normal">
              {fmtDateTime(trip.startTime)} --- {fmtDateTime(trip.endTime)}
            </p>
          </div>
          <p className="font-gray-500">Duration: {getDurationString(trip.startTime, trip.endTime)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex flex-col rounded-lg border p-6 pr-20 shadow-md" style={{ flex: "0 0 70%" }}>
          <div className="flex items-center gap-2">
            <IoCarSport className="h-6 w-6" />
            <h2 className="text-xl font-bold">Vehicle & Driver Information</h2>
          </div>

          <div className="mt-0 flex items-center justify-start">
            <div className="flex items-center gap-4">
              <Avatar
                shape="square"
                size={100}
                style={{ backgroundColor: "#f3f4f6", color: "#9ca3af" }}
                icon={<IoCarSport />}
              />

              <div className="flex flex-col justify-center gap-2">
                <p className="text-lg font-semibold">
                  {vehicle?.make} {vehicle?.model}
                </p>
                <p className="text-md text-gray-500">
                  License Plate: <Tag className="text-md font-bold">{trip.vehicleReg}</Tag>
                </p>
                <p className="text-md text-gray-500">Battery Capacity: {vehicle?.batteryKwh ?? "N/A"} kWh</p>
              </div>
            </div>

            <Divider
              type="vertical"
              style={{
                height: "180px",
                margin: "0px",
                padding: "0px",
                marginLeft: "20px",
                marginRight: "20px",
              }}
            />

            {!driver ? (
              <div className="text-md flex items-center justify-center text-gray-500">
                Driver information not available
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <Avatar
                  style={{ backgroundColor: "orange", verticalAlign: "middle", fontSize: "28px" }}
                  size={100}
                >
                  {initials}
                </Avatar>

                <div className="flex flex-col justify-center gap-2">
                  <p className="text-lg font-semibold">{driver.name}</p>
                  <p className="text-md text-gray-500">ID: {driver.id}</p>
                  <p className="text-md text-gray-500">Phone: {driver.phone}</p>
                  <p className="text-md text-gray-500">Email: {driver.email}</p>
                  <p className="text-md text-gray-500">
                    License: <Tag className="text-md font-bold">*****{driver.licenseNo.slice(-4)}</Tag>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 rounded-lg border p-8 shadow-md">
          <Timeline
            items={[
              {
                color: "green",
                children: (
                  <>
                    <p className="text-lg font-semibold">Starting Point</p>
                    <Tooltip title={startAddress} mouseEnterDelay={0} placement="top">
                      <p
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          whiteSpace: "normal",
                        }}
                      >
                        {startAddress}
                      </p>
                    </Tooltip>
                    <Tag color="#f97316" className="text-md">
                      {fmtDateTime(trip.startTime)}
                    </Tag>
                  </>
                ),
              },
              {
                color: "red",
                children: (
                  <>
                    <p className="text-lg font-semibold">Destination</p>
                    <Tooltip title={endAddress} mouseEnterDelay={0} placement="bottom">
                      <p
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          whiteSpace: "normal",
                        }}
                      >
                        {endAddress}
                      </p>
                    </Tooltip>
                    <Tag color="#f97316" className="text-md">
                      {fmtDateTime(trip.endTime)}
                    </Tag>
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-4 flex">
        <div className="text-lg font-semibold">Trip metrics</div>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-6">
        <div className="flex w-full flex-col items-start gap-2 rounded-lg border p-5 shadow-md">
          <div className="flex w-full items-center justify-between">
            <div className="text-md flex font-semibold">Total Distance</div>
            <div className="text-lg font-semibold">
              <GiPathDistance className="mr-2 mt-1" />
            </div>
          </div>
          <div className="w-4/5 break-words text-2xl font-bold">{trip.distanceKm.toFixed(2)} kms</div>
        </div>

        <div className="flex w-full flex-col items-start gap-2 rounded-lg border p-5 shadow-md">
          <div className="flex w-full items-center justify-between">
            <div className="text-md flex font-semibold">Energy Consumed</div>
            <div className="text-lg font-semibold">
              <BsLightningChargeFill className="mr-2 mt-1" />
            </div>
          </div>
          <div className="w-4/5 break-words text-2xl font-bold">{trip.energyKwh.toFixed(2)} kWh</div>
        </div>

        <div className="flex w-full flex-col items-start gap-2 rounded-lg border p-5 shadow-md">
          <div className="flex w-full items-center justify-between">
            <div className="text-md flex font-semibold">Battery Consumed</div>
            <div className="text-lg font-semibold">
              <RiBattery2ChargeLine className="mr-2 mt-1" />
            </div>
          </div>
          <div className="w-4/5 break-words text-2xl font-bold">{socUsed.toFixed(2)} %</div>
        </div>

        <div className="flex w-full flex-col items-start gap-2 rounded-lg border p-5 shadow-md">
          <div className="flex w-full items-center justify-between">
            <div className="text-md flex font-semibold">Average Speed</div>
            <div className="text-lg font-semibold">
              <BsSpeedometer className="mr-2 mt-1" />
            </div>
          </div>
          <div className="w-4/5 break-words text-2xl font-bold">{trip.avgSpeedKmh.toFixed(2)} kmph</div>
        </div>

        <div className="flex w-full flex-col items-start gap-2 rounded-lg border p-5 shadow-md">
          <div className="flex w-full items-center justify-between">
            <div className="text-md flex font-semibold">Max Speed</div>
            <div className="text-lg font-semibold">
              <BsSpeedometer className="mr-2 mt-1" />
            </div>
          </div>
          <div className="w-4/5 break-words text-2xl font-bold">{maxSpeed.toFixed(2)} kmph</div>
        </div>
      </div>

      <Tabs
        className="mt-4"
        defaultActiveKey="1"
        items={[
          {
            key: "1",
            label: "Trip Route",
            children: (
              <div
                className="map-wrapper"
                style={{
                  width: "100%",
                  height: "600px",
                  flex: "1 1 auto",
                  position: "relative",
                  borderRadius: "10px",
                  border: "1px solid #e1e1e4",
                  overflow: "hidden",
                }}
              >
                <TripRouteMap trip={trip} />
              </div>
            ),
          },
          {
            key: "2",
            label: "Battery SoC History",
            children: (
              <div style={{ width: "100%" }}>
                <div className="flex w-full items-center justify-center">
                  <p className="text-lg font-semibold">Battery SoC throughout the trip</p>
                </div>
                <ReactECharts
                  option={lineChartOption("Battery SoC (%)", "#22c55e", socSeries, { unit: "%" })}
                  style={{ height: 400 }}
                  notMerge
                />
              </div>
            ),
          },
          {
            key: "3",
            label: "Speed History",
            children: (
              <div style={{ width: "100%" }}>
                <div className="flex w-full items-center justify-center">
                  <p className="text-lg font-semibold">Vehicle speed throughout the trip</p>
                </div>
                <ReactECharts
                  option={lineChartOption("Vehicle Speed (km/h)", "#bb9412", speedSeries, {
                    yMax: Math.ceil(maxSpeed + 5),
                    unit: "km/h",
                  })}
                  style={{ height: 400 }}
                  notMerge
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
