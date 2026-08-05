"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import { Button, InputNumber, message, Modal, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useRef } from "react";
import { updateRow } from "@/data/store";
import type { Chargepoint, Connector, ConnectorStatus } from "@/data/types";
import { CONFIRM_BUTTON_PROPS } from "./derive";

const { Text } = Typography;
const { confirm } = Modal;

function connectorTagColor(status: string) {
  return status === "Available"
    ? "blue"
    : status === "Charging"
      ? "green"
      : status === "Preparing"
        ? "orange"
        : "red";
}

export default function Connectors({ cp }: { cp: Chargepoint }) {
  const limitRef = useRef(2);

  const setConnectorStatus = (connectorId: number, status: ConnectorStatus) => {
    updateRow("chargepoints", cp.id, {
      connectors: cp.connectors.map((c) =>
        c.id === connectorId ? { ...c, status } : c,
      ),
    });
  };

  const columns: TableColumnsType<Connector> = [
    {
      title: <Text>ID</Text>,
      dataIndex: "id",
      key: "id",
      width: "5%",
    },
    {
      title: <Text>Type</Text>,
      dataIndex: "type",
      key: "type",
      width: "10%",
    },
    {
      title: <Text>Status</Text>,
      dataIndex: "status",
      key: "status",
      width: "10%",
      render: (_: unknown, connector) => (
        <Tag color={connectorTagColor(connector.status)}>{connector.status}</Tag>
      ),
    },
    {
      title: <Text>Actions</Text>,
      dataIndex: "status",
      key: "actions",
      width: "20%",
      render: (_: unknown, connector) => (
        <Space wrap>
          <Button
            type="primary"
            style={{ marginLeft: "10px" }}
            onClick={() => {
              if (connector.status === "Charging") {
                confirm({
                  title:
                    "Are you sure you want to send a RemoteStopTransaction message to this Charger?",
                  icon: <ExclamationCircleFilled />,
                  content:
                    "When clicked the Proceed button, a RemoteStopTransaction Message will be sent to the Chargepoint which will result in instructing the Charger`s Connector to stop the ongoing Charging Session! This action cannot be undone!",
                  onOk() {
                    setConnectorStatus(connector.id, "Available");
                    message.success("Accepted");
                  },
                  onCancel() {},
                  ...CONFIRM_BUTTON_PROPS,
                });
              } else {
                limitRef.current = 2;
                confirm({
                  title:
                    "Are you sure you want to send a RemoteStartTransaction message to this Charger?",
                  icon: <ExclamationCircleFilled />,
                  content: (
                    <div>
                      When clicked the Proceed button, a RemoteStartTransaction
                      Message will be sent to the Chargepoint which will result
                      in instructing the Charger`s Connector to start a charging
                      session! This action cannot be undone!
                      <div className="mt-4 flex items-center gap-4">
                        <p>Limit:</p>
                        <InputNumber
                          className="w-full"
                          suffix="kWh"
                          min={0.1}
                          type="number"
                          defaultValue={2}
                          onChange={(value) => {
                            limitRef.current = Number(value);
                          }}
                        />
                      </div>
                    </div>
                  ),
                  onOk() {
                    setConnectorStatus(connector.id, "Charging");
                    message.success("Accepted");
                  },
                  onCancel() {},
                  ...CONFIRM_BUTTON_PROPS,
                });
              }
            }}
            disabled={
              connector.status !== "Available" && connector.status !== "Charging"
            }
          >
            {connector.status === "Charging" ? "Stop Charging" : "Start Charging"}
          </Button>
          <Button
            color="primary"
            variant="solid"
            onClick={() => {
              confirm({
                title:
                  "Are you sure you want to send a UnlockConnector message to this Charger?",
                icon: <ExclamationCircleFilled />,
                content:
                  "When clicked the Proceed button, an UnlockConnector Message will be sent to the Chargepoint which will result in instructing the Charger to unlock the Connector from it! This action cannot be undone!",
                onOk() {
                  message.success("Accepted");
                },
                onCancel() {},
                ...CONFIRM_BUTTON_PROPS,
              });
            }}
          >
            Unlock Connector
          </Button>
          <Button
            color="primary"
            variant="solid"
            onClick={() => {
              confirm({
                title:
                  "Are you sure you want to send a ChangeAvailability message to this Charger?",
                icon: <ExclamationCircleFilled />,
                content:
                  "When clicked the Proceed button, a ChangeAvailability Message will be sent to the Chargepoint which will result in instructing the Charger`s Connector to change its availability status! This action cannot be undone!",
                onOk() {
                  const makeOperative =
                    connector.status === "Faulted" ||
                    connector.status === "Unavailable";
                  setConnectorStatus(
                    connector.id,
                    makeOperative ? "Available" : "Unavailable",
                  );
                  message.success("Accepted");
                },
                onCancel() {},
                ...CONFIRM_BUTTON_PROPS,
              });
            }}
          >
            {connector.status === "Faulted" || connector.status === "Unavailable"
              ? "Make Operative"
              : "Make Inoperative"}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rowKey="id"
      dataSource={[...cp.connectors].sort((a, b) => (a.id > b.id ? 1 : -1))}
      scroll={{ y: 200 }}
      pagination={false}
    />
  );
}
