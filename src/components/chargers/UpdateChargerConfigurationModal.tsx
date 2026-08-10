"use client";

import { Button, Input, Modal, Select, Typography } from "antd";
import { useState } from "react";
import { FAKE_CHARGER_CONFIGS } from "./derive";
import { message } from "@/lib/antdStatic";

const { Text } = Typography;

export default function UpdateChargerConfigurationModal({
  cpid,
  isModalOpen,
  handleModalVisibility,
}: {
  cpid: string;
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
}) {
  const [updatingChargerConfiguration, setUpdatingChargerConfiguration] =
    useState(false);
  const [selectedKeyForUpdate, setSelectedKeyForUpdate] = useState<string>("");
  const [selectedValueForUpdate, setSelectedValueForUpdate] = useState<string>("");

  function updateConfiguration() {
    if (!selectedKeyForUpdate) {
      message.warning("Unable to change Charger Configurations!");
      return;
    }
    setUpdatingChargerConfiguration(true);
    setTimeout(() => {
      setUpdatingChargerConfiguration(false);
      message.success("Updated Charger Configuration!");
    }, 400);
  }

  return (
    <Modal
      title={
        <>
          <Text style={{ fontWeight: 300, fontSize: "15px" }}>
            Update Configuration -
          </Text>{" "}
          <Text style={{ fontWeight: 600, fontSize: "18px" }}>{cpid}</Text>
        </>
      }
      open={isModalOpen}
      onOk={() => handleModalVisibility(false)}
      onCancel={() => handleModalVisibility(false)}
      width={460}
      footer={
        <Button
          type="primary"
          onClick={() => updateConfiguration()}
          disabled={updatingChargerConfiguration}
        >
          Update Configuration
        </Button>
      }
    >
      <div>
        <Text>Key</Text>
        <Select
          style={{ width: "100%", marginTop: "10px" }}
          disabled={updatingChargerConfiguration}
          value={selectedKeyForUpdate || undefined}
          onChange={(val: string) => {
            setSelectedKeyForUpdate(val);
            const foundConfigObj = FAKE_CHARGER_CONFIGS.find(
              (config) => config.key === val,
            );
            setSelectedValueForUpdate(foundConfigObj?.value ?? "");
          }}
          options={FAKE_CHARGER_CONFIGS.map((config) => ({
            value: config.key,
            label: config.key,
            disabled: config.readonly,
          }))}
        />
      </div>
      <div style={{ marginTop: "10px" }}>
        <Text>Value</Text>
        <Input
          placeholder="Basic usage"
          value={selectedValueForUpdate}
          disabled={updatingChargerConfiguration}
          onChange={(e) => setSelectedValueForUpdate(e.target?.value)}
        />
      </div>
    </Modal>
  );
}
