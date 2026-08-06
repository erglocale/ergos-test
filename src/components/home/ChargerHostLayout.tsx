"use client";

import { InfoCircleOutlined } from "@ant-design/icons";
import {
  Badge,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Select,
  Tabs,
  Tooltip,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import ReactECharts from "echarts-for-react";
import { useMemo, useState } from "react";
import { MdArrowDownward, MdArrowUpward } from "react-icons/md";
import { useDb } from "@/data/store";
import ChargerWarning, { type ChargerWarningItem } from "./ChargerWarning";
import DashboardMap from "@/components/maps/DashboardMap";

const { Text, Title } = Typography;

const { RangePicker } = DatePicker;

const rangePresets: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: "Last 7 Days", value: [dayjs().subtract(7, "day"), dayjs()] },
  { label: "Last 14 Days", value: [dayjs().subtract(14, "day"), dayjs()] },
  { label: "Last 30 Days", value: [dayjs().subtract(30, "day"), dayjs()] },
  { label: "Last 90 Days", value: [dayjs().subtract(90, "day"), dayjs()] },
];

// Shape of the "previous period" comparison object the production analytics
// API returns — rebuilt locally from the dummy store.
interface ComparisonMetric {
  converstion_type: "PERCENTAGE";
  value: number;
  startDate: string;
  endDate: string;
}

export default function ChargerHostLayout() {
  const db = useDb();

  const [startDate, setStartDate] = useState(() =>
    dayjs().subtract(10, "day").toISOString(),
  );
  const [endDate, setEndDate] = useState(() => dayjs().toISOString());
  const [warningsQueryStatus, setWarningsQueryStatus] = useState("New");

  /** ************  Date filtered analytics (from the dummy store)  ******** */
  const chargerSingleMetricsData = useMemo(() => {
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    const durationMs = end.diff(start);
    const prevStart = start.subtract(durationMs, "millisecond");

    const inWindow = (from: Dayjs, to: Dayjs) =>
      db.sessions.filter((s) => {
        const t = dayjs(s.startTime);
        return t.isAfter(from) && t.isBefore(to);
      });

    const current = inWindow(start, end);
    const previous = inWindow(prevStart, start);

    const sum = (rows: typeof current, pick: (r: (typeof current)[number]) => number) =>
      rows.reduce((acc, r) => acc + pick(r), 0);

    const pctChange = (cur: number, prev: number): number =>
      prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0;

    const comparison = (cur: number, prev: number): ComparisonMetric => ({
      converstion_type: "PERCENTAGE",
      value: pctChange(cur, prev),
      startDate,
      endDate,
    });

    const totalkWhDelivered = sum(current, (s) => s.energyKwh);
    const totalAmountConsumed = sum(current, (s) => s.cost);
    const totalCount = current.length;

    return {
      total: db.chargepoints.length,
      online: db.chargepoints.filter((c) => c.status === "Online").length,
      totalkWhDelivered,
      totalAmountConsumed,
      totalCount,
      previousTotalkWhDelivered: comparison(
        totalkWhDelivered,
        sum(previous, (s) => s.energyKwh),
      ),
      previousTotalAmountConsumed: comparison(
        totalAmountConsumed,
        sum(previous, (s) => s.cost),
      ),
      previousTotalCount: comparison(totalCount, previous.length),
    };
  }, [db.sessions, db.chargepoints, startDate, endDate]);
  /** *************************************************************** */

  function getComparisionValues(comparisionObject?: ComparisonMetric) {
    const comparisionValues: {
      unit?: string;
      value?: number;
      comparisionDateText?: string;
    } = {};
    if (comparisionObject?.converstion_type === "PERCENTAGE") {
      comparisionValues.unit = "%";
      comparisionValues.value = Math.round(Number(comparisionObject?.value));

      // difference in days
      const diff = dayjs(comparisionObject?.endDate).diff(
        dayjs(comparisionObject?.startDate),
        "day",
      );

      if (diff < 7) {
        comparisionValues.comparisionDateText = `last ${diff} days`;
      } else if (diff === 7) {
        comparisionValues.comparisionDateText = "last week";
      } else if (diff === 30 || diff === 31) {
        comparisionValues.comparisionDateText = "last month";
      } else if (diff === 365 || diff === 366) {
        comparisionValues.comparisionDateText = "last year";
      } else {
        comparisionValues.comparisionDateText = `last ${diff} days`;
      }
    }
    return comparisionValues;
  }

  /** ************  Charger warnings (from the dummy store)  *************** */
  const chargerWarnings = useMemo<ChargerWarningItem[]>(
    () =>
      db.chargerWarnings
        .filter((w) => w.warningObject.status === warningsQueryStatus)
        .map((w) => ({
          warningId: w.id,
          charger: {
            id: w.charger.id,
            name: w.charger.name,
            address:
              db.chargepoints.find((c) => c.id === w.charger.id)?.address ??
              w.charger.hub,
          },
          connector: w.connector,
          warningObject: w.warningObject,
        })),
    [db.chargerWarnings, db.chargepoints, warningsQueryStatus],
  );

  const chargerWarningsCount = chargerWarnings.length;
  /** *************************************************************** */

  const items = [
    {
      key: "1",
      label: (
        <Badge
          count={chargerWarningsCount}
          overflowCount={10}
          offset={[20, -1]}
          style={{ zIndex: 1000 }}
        >
          Charger warnings
        </Badge>
      ),
      children: (
        <div>
          {chargerWarningsCount === 0 ? (
            <Card style={{ borderRadius: 12 }}>
              <Empty description="No charger warnings" />
            </Card>
          ) : (
            <>
              {chargerWarnings.map((warning) => (
                <Card
                  key={warning.warningId}
                  style={{ position: "relative", marginBottom: 12 }}
                >
                  <ChargerWarning
                    warning={warning}
                    type={
                      warning.warningObject.type === "ChargerOffline"
                        ? "downtimeWarning"
                        : "connectorFaultWarning"
                    }
                  />
                </Card>
              ))}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={3} style={{ marginBottom: "0px" }}>
          Overview
        </Title>
        <RangePicker
          presets={rangePresets}
          value={[dayjs(startDate), dayjs(endDate)]}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              setStartDate(dates[0].toISOString());
              setEndDate(dates[1].toISOString());
            }
          }}
          format="DD MMM YYYY"
          allowClear={false}
        />
      </div>

      <Row gutter={[14, 14]} style={{ marginTop: "20px" }}>
        <Col span={10}>
          <Card hoverable style={{ height: "440px" }}>
            <div>
              <Title level={5}>Chargers Overview </Title>
            </div>

            <ReactECharts
              style={{ width: "100%", height: "360px", padding: "0px" }}
              option={{
                tooltip: {
                  trigger: "item",
                },
                color: ["#0284c7", "#22c55e", "#ef4444"],
                legend: {
                  top: "2%",
                  left: "center",
                  itemGap: 20,
                },

                series: [
                  {
                    name: "Chargers Overview",
                    type: "pie",
                    radius: ["-40%", "36%"],
                    label: {
                      position: "inner",
                      fontSize: 14,
                    },
                    labelLine: {
                      show: false,
                    },
                    data: [
                      {
                        value: Number(chargerSingleMetricsData?.total),
                        name: `Total Chargers`,
                      },
                    ],
                    top: "10%",
                  },
                  {
                    name: "Chargers Overview",
                    type: "pie",
                    radius: ["50%", "90%"],
                    avoidLabelOverlap: false,
                    itemStyle: {
                      borderRadius: 10,
                      borderColor: "#fff",
                      borderWidth: 2,
                    },
                    label: {
                      show: false,
                      position: "center",
                    },
                    emphasis: {
                      label: {
                        show: false,
                        fontSize: 40,
                        fontWeight: "bold",
                      },
                    },
                    labelLine: {
                      show: false,
                    },
                    data: [
                      {
                        value: chargerSingleMetricsData?.online,
                        name: "Chargers Online",
                      },
                      {
                        value:
                          Number(chargerSingleMetricsData?.total) -
                          Number(chargerSingleMetricsData?.online),
                        name: "Chargers Offline",
                      },
                    ],
                    top: "10%",
                  },
                ],
              }}
              lazyUpdate
            />
          </Card>
        </Col>
        <Col span={14}>
          <Card hoverable style={{ height: "440px" }}>
            <DashboardMap mapContainerHeight="390px" />
          </Card>
        </Col>
      </Row>
      <Row
        gutter={[14, 14]}
        style={{
          marginTop: "20px",
          marginBottom: "40px",
          paddingBottom: "40px",
        }}
      >
        <Col span={16}>
          <Tabs
            defaultActiveKey="1"
            items={items}
            type="card"
            tabBarGutter={22}
            tabBarExtraContent={{
              right: (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Text>Status : </Text>
                  <Select
                    style={{
                      width: 100,
                      marginLeft: "10px",
                    }}
                    size="small"
                    value={warningsQueryStatus}
                    placeholder="Status"
                    onChange={(val) => {
                      setWarningsQueryStatus(val);
                    }}
                    options={[
                      {
                        value: "New",
                        label: "New",
                      },
                      {
                        value: "Fixed",
                        label: "Fixed",
                      },
                      {
                        value: "Ignore",
                        label: "Ignored",
                      },
                      {
                        value: "Working",
                        label: "Working",
                      },
                    ]}
                  />
                </div>
              ),
            }}
          />
        </Col>
        <Col span={8}>
          <Row gutter={[12, 12]}>
            <Col span={24}>
              <Card hoverable style={{ height: "100%" }}>
                <div>
                  <Text style={{ color: "gray", marginRight: "4px" }}>
                    Total energy delivered
                  </Text>
                  <Tooltip
                    placement="top"
                    title="The total energy delivered by all the hosted chargers in the selected date range."
                  >
                    <InfoCircleOutlined
                      style={{
                        color: "gray",
                      }}
                    />
                  </Tooltip>
                </div>
                <div style={{ marginTop: "10px" }}>
                  <Title level={2} style={{ margin: "0px" }}>
                    {Number(chargerSingleMetricsData?.totalkWhDelivered).toFixed(
                      3,
                    )}{" "}
                    <span style={{ fontSize: "18px", fontWeight: 400 }}>
                      kWh
                    </span>
                  </Title>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: "8px",
                  }}
                >
                  {(() => {
                    const { value = 0, unit, comparisionDateText } =
                      getComparisionValues(
                        chargerSingleMetricsData?.previousTotalkWhDelivered,
                      );

                    return (
                      <>
                        {value < 0 ? (
                          <MdArrowDownward
                            style={{
                              marginTop: "4px",
                              color: "red",
                              fontSize: "16px",
                            }}
                          />
                        ) : (
                          <MdArrowUpward
                            style={{
                              marginTop: "2px",
                              color: "green",
                              fontSize: "16px",
                            }}
                          />
                        )}
                        <Text style={{ color: value < 0 ? "red" : "green" }}>
                          {value < 0 ? Math.abs(value) : value}
                          {unit} from {comparisionDateText}
                        </Text>
                      </>
                    );
                  })()}
                </div>
              </Card>
            </Col>
            <Col span={24}>
              <Card hoverable style={{ height: "100%" }}>
                <div>
                  <Text style={{ color: "gray", marginRight: "4px" }}>
                    Total revenue generated
                  </Text>
                  <Tooltip
                    placement="top"
                    title="The total revenue generated by all the hosted chargers in the selected date range"
                  >
                    <InfoCircleOutlined
                      style={{
                        color: "gray",
                      }}
                    />
                  </Tooltip>
                </div>
                <div style={{ marginTop: "10px" }}>
                  <Title level={2} style={{ margin: "0px" }}>
                    {Number(
                      chargerSingleMetricsData?.totalAmountConsumed,
                    ).toFixed(2)}{" "}
                    <span style={{ fontSize: "18px", fontWeight: 400 }}>
                      {db.profile.zone.currencySymbol}
                    </span>
                  </Title>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: "8px",
                  }}
                >
                  {(() => {
                    const { value = 0, unit, comparisionDateText } =
                      getComparisionValues(
                        chargerSingleMetricsData?.previousTotalAmountConsumed,
                      );

                    return (
                      <>
                        {value < 0 ? (
                          <MdArrowDownward
                            style={{
                              marginTop: "4px",
                              color: "red",
                              fontSize: "16px",
                            }}
                          />
                        ) : (
                          <MdArrowUpward
                            style={{
                              marginTop: "2px",
                              color: "green",
                              fontSize: "16px",
                            }}
                          />
                        )}
                        <Text style={{ color: value < 0 ? "red" : "green" }}>
                          {value < 0 ? Math.abs(value) : value}
                          {unit} from {comparisionDateText}
                        </Text>
                      </>
                    );
                  })()}
                </div>
              </Card>
            </Col>
            <Col span={24}>
              <Card hoverable style={{ height: "100%" }}>
                <div>
                  <Text style={{ color: "gray", marginRight: "4px" }}>
                    Total Charging Sessions
                  </Text>
                  <Tooltip
                    placement="top"
                    title="The total number of charging sessions performed on all the hosted chargers in the selected date range."
                  >
                    <InfoCircleOutlined
                      style={{
                        color: "gray",
                      }}
                    />
                  </Tooltip>
                </div>
                <div style={{ marginTop: "10px" }}>
                  <Title level={2} style={{ margin: "0px" }}>
                    {Number(chargerSingleMetricsData?.totalCount).toFixed(0)}{" "}
                  </Title>
                </div>
                <div
                  style={{
                    display: "flex",
                    marginTop: "8px",
                  }}
                >
                  {(() => {
                    const { value = 0, unit, comparisionDateText } =
                      getComparisionValues(
                        chargerSingleMetricsData?.previousTotalCount,
                      );

                    return (
                      <>
                        {value < 0 ? (
                          <MdArrowDownward
                            style={{
                              marginTop: "4px",
                              color: "red",
                              fontSize: "16px",
                            }}
                          />
                        ) : (
                          <MdArrowUpward
                            style={{
                              marginTop: "2px",
                              color: "green",
                              fontSize: "16px",
                            }}
                          />
                        )}
                        <Text style={{ color: value < 0 ? "red" : "green" }}>
                          {value < 0 ? Math.abs(value) : value}
                          {unit} from {comparisionDateText}
                        </Text>
                      </>
                    );
                  })()}
                </div>
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>
    </>
  );
}
