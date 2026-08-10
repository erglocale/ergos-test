"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import { Button, Dropdown, Tag, Typography } from "antd";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import { useRouter } from "next/navigation";
import { LuCircleCheckBig, LuCircleOff, LuEllipsis } from "react-icons/lu";
import { updateRow } from "@/data/store";
import type { ChargerWarning as ChargerWarningRow } from "@/data/types";
import { message, modal } from "@/lib/antdStatic";

dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

const { Text } = Typography;

// View model matching the records the production warnings API returns
// (warningId + charger with address), built from db.chargerWarnings rows.
export interface ChargerWarningItem {
  /** db.chargerWarnings row id — production's record.warningId. */
  warningId: string;
  charger: { id: string; name: string; address: string };
  connector: ChargerWarningRow["connector"];
  warningObject: ChargerWarningRow["warningObject"];
}

export const splitCamelCaseAndUppercase = (str?: string) => {
  if (!str) return "";
  return str.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
};

// Store-backed replacement for useUpdateWarningStatusMutation: patches the
// warning row's status (lastChecked stands in for the API's updatedAt).
function applyWarningStatus(
  warning: ChargerWarningItem,
  status: "Ignore" | "Fixed",
) {
  updateRow("chargerWarnings", warning.warningId, {
    warningObject: {
      ...warning.warningObject,
      status,
      lastChecked: new Date().toISOString(),
    },
  });
}

function DisplayWarning({
  warning,
  type,
}: {
  warning: ChargerWarningItem;
  type: "downtimeWarning" | "connectorFaultWarning";
}) {
  if (type === "downtimeWarning") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: "20px",
        }}
      >
        <Text style={{ color: "red" }}>
          Offline for last{" "}
          {Math.round(Number(warning?.warningObject?.offlineForHours))} hours
        </Text>

        <Text
          style={{
            color: "white",
            backgroundColor: "#0284c7",
            padding: "10px",
            borderRadius: "7px",
            paddingTop: "5px",
            paddingBottom: "5px",
            marginTop: "6px",
          }}
        >
          Resolution tip: {warning?.warningObject?.resolution}
        </Text>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginLeft: "20px",
      }}
    >
      <Text style={{ color: "red" }}>
        Connector {warning?.connector?.connectorId} is in{" "}
        {warning?.connector?.status} status for{" "}
        {dayjs(warning?.connector?.updatedAt).fromNow(true)}
      </Text>
      <Text style={{ color: "#0284c7" }}>
        Last status recieved at:{" "}
        {dayjs(warning?.connector?.updatedAt).format("lll")}
      </Text>

      <Text
        style={{
          color: "white",
          backgroundColor: "#0284c7",
          padding: "10px",
          borderRadius: "7px",
          paddingTop: "5px",
          paddingBottom: "5px",
          marginTop: "6px",
        }}
      >
        Resolution tip: {warning?.warningObject?.resolution}
      </Text>
    </div>
  );
}

/**
 * Displays a charger warning card with ignore/resolve actions wired to the
 * dummy store.
 */
export default function ChargerWarning({
  warning,
  type = "downtimeWarning",
}: {
  warning: ChargerWarningItem;
  type?: "downtimeWarning" | "connectorFaultWarning";
}) {
  const router = useRouter();

  const showIgnoreConfirm = () => {
    modal.confirm({
      title: "Are you sure you want to ignore this warning?",
      icon: <ExclamationCircleFilled />,
      content:
        "This action may have unintended consequences. Are you sure you want to ignore this warning without resolving it? If continued, you can find all the ignored warnings in the Ignored Warnings section.",
      onOk: () => {
        applyWarningStatus(warning, "Ignore");
        message.warning("Warning ignored!");
      },
      okText: "Yes, ignore",
      onCancel() {},
      width: 500,
    });
  };

  const showResolveConfirm = () => {
    modal.confirm({
      title: "Are you sure you want to mark this warning as resolved?",
      icon: <ExclamationCircleFilled />,
      content:
        "If continued, this warning will be marked as resolved. You can find all the resolved warnings in the Resolved Warnings section.",
      onOk: () => {
        applyWarningStatus(warning, "Fixed");
        message.success("Warning marked as resolved!");
      },
      okText: "Yes, resolve",
      onCancel() {},
      width: 540,
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: "20px",
        }}
        onClick={() => {
          router.push(`/chargingStations/${warning?.charger?.id}`);
        }}
      >
        <Tag color="volcano" style={{ textAlign: "center", fontWeight: 600 }}>
          {splitCamelCaseAndUppercase(warning?.warningObject?.type)}
        </Tag>
        <Text
          style={{
            width: 200,
            fontWeight: 700,
            fontSize: "16px",
          }}
          ellipsis={{ tooltip: warning?.charger?.name }}
        >
          {warning?.charger?.name}
        </Text>
        <Text style={{ color: "gray" }}>{warning?.charger?.id}</Text>
        <Text
          style={{
            width: 200,
            fontSize: "11px",
            color: "gray",
          }}
          ellipsis={{ tooltip: warning?.charger?.address }}
        >
          {warning?.charger?.address}
        </Text>
      </div>
      <div
        style={{
          height: "90px",
          width: "6px",
          backgroundColor: "orange",
          borderRadius: "7px",
          marginLeft: "20px",
        }}
      />
      <DisplayWarning warning={warning} type={type} />

      <Dropdown
        menu={{
          items: [
            {
              label: "Ignore Warning",
              key: "1",
              icon: <LuCircleOff style={{ height: "14px" }} />,
            },
            {
              label: "Mark as Resolved",
              key: "2",
              icon: <LuCircleCheckBig style={{ height: "14px" }} />,
            },
          ],
          onClick: ({ key }) => {
            if (key === "1") {
              showIgnoreConfirm();
            } else {
              showResolveConfirm();
            }
          },
        }}
        trigger={["click"]}
      >
        <Button
          type="default"
          icon={<LuEllipsis style={{ width: "16px" }} />}
          size="small"
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            padding: "10px 20px",
            cursor: "pointer",
          }}
        />
      </Dropdown>
    </div>
  );
}
