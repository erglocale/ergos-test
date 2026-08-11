"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import { Card, Col, DatePicker, Empty, Row, Tooltip } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import { useDb } from "@/data/store";
import type { Driver } from "@/data/types";
import { DATE_FORMAT } from "@/lib/dateFormat";

const { RangePicker } = DatePicker;

// Production's orange gradient bars, shared by all five charts.
const barSeriesStyle = {
  itemStyle: {
    borderRadius: [5, 5, 5, 5], // rounded corners
    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
      { offset: 0, color: "#FAAA71" },
      { offset: 0.5, color: "#FF9646" },
      { offset: 1, color: "#f97316" },
    ]),
  },
  emphasis: {
    itemStyle: {
      borderRadius: [5, 5], // if you want different radius on hover
    },
  },
};

interface EchartsTooltipParam {
  name: string;
  value: number | string;
}

// One analytics chart card — title row with info tooltip + running total,
// orange gradient bar chart (or Empty when there is no data), exactly as
// the production DriverManagement/Analytics.jsx cards.
function AnalyticsChartCard({
  title,
  infoTooltip,
  totalText,
  dates,
  data,
  tooltipFormatter,
  yAxis,
  gridLeft,
}: {
  title: string;
  infoTooltip: string;
  totalText: string;
  dates: string[];
  data: (number | string)[];
  tooltipFormatter: (params: EchartsTooltipParam[]) => string;
  yAxis: Record<string, unknown>;
  gridLeft: number;
}) {
  return (
    <Card
      styles={{ body: { padding: "14px", paddingTop: "0px" } }}
      title={
        <div className="flex items-center justify-between">
          <div className="flex">
            <p>{title}</p>
            <Tooltip title={infoTooltip} mouseEnterDelay={0}>
              <InfoCircleOutlined className="ml-2 text-gray-500" />
            </Tooltip>
          </div>
          <div className="flex items-center">
            <p className="text-md font-normal text-gray-500">Total: </p>
            <p className="text-md ml-1 font-bold">{totalText}</p>
          </div>
        </div>
      }
    >
      {dates.length === 0 ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "360px",
          }}
        >
          <Empty />
        </div>
      ) : (
        <ReactECharts
          style={{ width: "100%", height: "360px", padding: "0px" }}
          option={{
            tooltip: {
              trigger: "axis",
              axisPointer: {
                type: "shadow",
              },
              formatter: tooltipFormatter,
            },
            color: ["#FFA57E"],
            xAxis: {
              type: "category",
              data: dates,
            },
            yAxis,
            series: [
              {
                data,
                type: "bar",
                ...barSeriesStyle,
              },
            ],
            grid: {
              top: 26,
              right: 10,
              left: gridLeft,
            },
          }}
          lazyUpdate
        />
      )}
    </Card>
  );
}

export default function DriverAnalytics({ driver }: { driver: Driver }) {
  const db = useDb();
  // Production defaults to the last 10 days.
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(10, "day"), dayjs()]);

  // Production hits the driver timeseries analytics endpoint; the sandbox
  // aggregates db.trips / db.sessions for this driver per day instead.
  const { dates, sessionsCount, totalKwhCharged, totalKwhUsed, totalDistanceDriven, totalHoursDriven } =
    useMemo(() => {
      const start = range[0].startOf("day");
      const end = range[1].endOf("day");
      const inWindow = (iso: string) =>
        !dayjs(iso).isBefore(start) && !dayjs(iso).isAfter(end);

      const byDay = new Map<
        string,
        { sessions: number; charged: number; used: number; km: number; hours: number }
      >();
      const ensure = (key: string) => {
        if (!byDay.has(key)) {
          byDay.set(key, { sessions: 0, charged: 0, used: 0, km: 0, hours: 0 });
        }
        return byDay.get(key)!;
      };

      db.sessions
        .filter((s) => s.driverName === driver.name && inWindow(s.startTime))
        .forEach((s) => {
          const row = ensure(dayjs(s.startTime).format("YYYY-MM-DD"));
          row.sessions += 1;
          row.charged += Number(s.energyKwh || 0);
        });

      db.trips
        .filter((t) => t.driverName === driver.name && inWindow(t.startTime))
        .forEach((t) => {
          const row = ensure(dayjs(t.startTime).format("YYYY-MM-DD"));
          row.used += Number(t.energyKwh || 0);
          row.km += Number(t.distanceKm || 0);
          row.hours += Math.max(0, dayjs(t.endTime).diff(dayjs(t.startTime), "minute")) / 60;
        });

      // Production aligns all metrics on a shared, sorted date axis of the
      // days that have any data, zero-filling the gaps.
      const keys = [...byDay.keys()].sort();
      return {
        dates: keys.map((k) => dayjs(k).format("DD MMM YYYY")),
        sessionsCount: keys.map((k) => byDay.get(k)!.sessions),
        totalKwhCharged: keys.map((k) => byDay.get(k)!.charged.toFixed(2)),
        totalKwhUsed: keys.map((k) => byDay.get(k)!.used.toFixed(2)),
        totalDistanceDriven: keys.map((k) => byDay.get(k)!.km.toFixed(1)),
        totalHoursDriven: keys.map((k) => byDay.get(k)!.hours.toFixed(1)),
      };
    }, [db.sessions, db.trips, driver.name, range]);

  return (
    <>
      <Card styles={{ body: { padding: "10px" } }} style={{ width: "380px" }}>
        <div style={{ display: "flex" }}>
          <RangePicker
            allowClear={false}
            style={{ marginRight: "10px", width: "100%" }}
            value={range}
            onChange={(values) => {
              if (!values?.[0] || !values?.[1]) return;
              setRange([values[0], values[1]]);
            }}
            format={DATE_FORMAT}
          />
        </div>
      </Card>

      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={12}>
          <AnalyticsChartCard
            title="Total Charging cycles"
            infoTooltip="The number of charging sessions initiated by the driver during the selected time period (in ergOS)."
            totalText={`${sessionsCount.reduce((acc, val) => acc + Number(val), 0)} cycles`}
            dates={dates}
            data={sessionsCount}
            tooltipFormatter={(params) => ` <b>${params[0].name}</b></br>
                      Total Charging Cycles: <b>${params[0].value}</b>`}
            yAxis={{
              type: "value",
              name: "Number of Charging Cycles",
              nameLocation: "middle",
              nameGap: 34,
            }}
            gridLeft={50}
          />
        </Col>

        <Col span={12}>
          <AnalyticsChartCard
            title="Total Energy Charged"
            infoTooltip="The total electrical energy (in kWh) charged by the driver within the selected time period (in ergOS)."
            totalText={`${totalKwhCharged.reduce((acc, val) => acc + Number(val), 0).toFixed(2)} kWh`}
            dates={dates}
            data={totalKwhCharged}
            tooltipFormatter={(params) => `
                        <b>${params[0].name}</b></br>
                        Total energy charged: <b>${params[0].value} kWh</b>
                      `}
            yAxis={{
              type: "value",
              name: "Energy Used (kWh)",
              nameLocation: "middle",
              nameGap: 40,
            }}
            gridLeft={60}
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={12}>
          <AnalyticsChartCard
            title="Total Energy Consumed"
            infoTooltip="The total electrical energy (in kWh) consumed by the driver while driving during the selected time period."
            totalText={`${totalKwhUsed.reduce((acc, val) => acc + Number(val), 0).toFixed(2)} kWh`}
            dates={dates}
            data={totalKwhUsed}
            tooltipFormatter={(params) => `
                        <b>${params[0].name}</b></br>
                        Total energy consumed: <b>${params[0].value} kWh</b>
                      `}
            yAxis={{
              type: "value",
              name: "Energy Used (kWh)",
              nameLocation: "middle",
              nameGap: 40,
            }}
            gridLeft={60}
          />
        </Col>

        <Col span={12}>
          <AnalyticsChartCard
            title="Total Distance Driven"
            infoTooltip="The cumulative distance covered by the driver during the selected time period, based on GPS data."
            totalText={`${totalDistanceDriven.reduce((acc, val) => acc + Number(val), 0).toFixed(2)} kms`}
            dates={dates}
            data={totalDistanceDriven}
            tooltipFormatter={(params) => `<b>${params[0].name}</b></br>
                      Distance Driven: <b>${params[0].value} kms</b>`}
            yAxis={{
              type: "value",
              axisLabel: {
                formatter: "{value} kms",
              },
              name: "Distance Driven (kms)",
              nameLocation: "middle",
              nameGap: 70,
            }}
            gridLeft={88}
          />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: "20px", paddingBottom: "20px" }}>
        <Col span={12}>
          <AnalyticsChartCard
            title="Total Duration Driven"
            infoTooltip="The total duration, the driver was driving during the selected time period, calculated from trip and telematics data."
            totalText={`${totalHoursDriven.reduce((acc, val) => acc + Number(val), 0).toFixed(2)} hrs`}
            dates={dates}
            data={totalHoursDriven}
            tooltipFormatter={(params) => ` <b>${params[0].name}</b></br>
                      Hours Driven: <b>${params[0].value} hrs</b>`}
            yAxis={{
              type: "value",
              axisLabel: {
                formatter: "{value} hrs",
              },
              name: "Hours Driven (hrs)",
              nameLocation: "middle",
              nameGap: 70,
            }}
            gridLeft={88}
          />
        </Col>
      </Row>
    </>
  );
}
