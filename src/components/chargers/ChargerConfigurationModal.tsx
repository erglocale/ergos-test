"use client";

import { Button, message, Modal, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { useState } from "react";
import { FAKE_CHARGER_CONFIGS } from "./derive";

const { Text } = Typography;

type ConfigRow = (typeof FAKE_CHARGER_CONFIGS)[number];

export default function ChargerConfigurationModal({
  cpid,
  isModalOpen,
  handleModalVisibility,
}: {
  cpid: string;
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
}) {
  const [refetchingConfigs, setRefetchingConfigs] = useState(false);

  const tableColumns: TableColumnsType<ConfigRow> = [
    {
      title: "Configuration Key",
      dataIndex: "key",
      key: "key",
      render: (_: unknown, config) => <div>{config.key}</div>,
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      render: (_: unknown, config) => <div>{config.value}</div>,
    },
    {
      title: "Read Only",
      dataIndex: "readonly",
      key: "readonly",
      render: (_: unknown, config) => (
        <div>{config.readonly === true ? "True" : "False"}</div>
      ),
    },
  ];

  function refetchConfigurationsFromChargepoint() {
    setRefetchingConfigs(true);
    // Sandbox: pretend a GetConfiguration OCPP round-trip happened.
    setTimeout(() => {
      setRefetchingConfigs(false);
      message.success("Configurations fetched from the Charger!");
    }, 400);
  }

  return (
    <Modal
      title={
        <>
          <Text style={{ fontWeight: 300, fontSize: "15px" }}>
            Configurations of Chargepoint -
          </Text>{" "}
          <Text style={{ fontWeight: 600, fontSize: "18px" }}>{cpid}</Text>
        </>
      }
      open={isModalOpen}
      onOk={() => handleModalVisibility(false)}
      onCancel={() => handleModalVisibility(false)}
      width={600}
      footer={
        <Button type="primary" onClick={() => refetchConfigurationsFromChargepoint()}>
          Refetch Configurations
        </Button>
      }
    >
      <Table
        columns={tableColumns}
        dataSource={FAKE_CHARGER_CONFIGS}
        rowKey="key"
        loading={refetchingConfigs}
      />
    </Modal>
  );
}
