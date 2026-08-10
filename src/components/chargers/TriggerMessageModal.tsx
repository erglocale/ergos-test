"use client";

import { Alert, Button, Input, Modal, Select, Typography } from "antd";
import { useState } from "react";
import { message } from "@/lib/antdStatic";

const { Text } = Typography;

export default function TriggerMessageModal({
  cpid,
  isModalOpen,
  handleModalVisibility,
}: {
  cpid: string;
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
}) {
  const [sendingTriggerMessage, setSendingTriggerMessage] = useState(false);
  const [selectedMessageForTrigger, setSelectedMessageForTrigger] =
    useState("Heartbeat");
  const [connectorId, setConnectorId] = useState<string | number>(0);

  function sendTriggerMessage() {
    setSendingTriggerMessage(true);
    setTimeout(() => {
      setSendingTriggerMessage(false);
      message.success("Accepted");
    }, 400);
  }

  return (
    <Modal
      title={
        <>
          <Text style={{ fontWeight: 300, fontSize: "15px" }}>
            Trigger Message -
          </Text>{" "}
          <Text style={{ fontWeight: 600, fontSize: "18px" }}>{cpid}</Text>
        </>
      }
      open={isModalOpen}
      onOk={() => handleModalVisibility(false)}
      onCancel={() => handleModalVisibility(false)}
      width={520}
      footer={
        <Button
          type="primary"
          onClick={() => sendTriggerMessage()}
          disabled={sendingTriggerMessage}
        >
          Send Trigger Message
        </Button>
      }
    >
      <Alert
        message="Initiating an Trigger Message will send an TriggerMessage to the Chargepoint, which will result in instructing the Charger to send the requested message back to the CSMS!"
        type="warning"
        showIcon={false}
        closable={false}
      />
      <div style={{ marginTop: "10px" }}>
        <Text>Message</Text>
        <Select
          style={{ width: "100%", marginTop: "10px" }}
          disabled={sendingTriggerMessage}
          onChange={(val: string) => setSelectedMessageForTrigger(val)}
          options={[
            { value: "BootNotification", label: "BootNotification" },
            {
              value: "DiagnosticsStatusNotification",
              label: "DiagnosticsStatusNotification",
            },
            {
              value: "FirmwareStatusNotification",
              label: "FirmwareStatusNotification",
            },
            { value: "Heartbeat", label: "Heartbeat" },
            { value: "MeterValues", label: "MeterValues" },
            { value: "StatusNotification", label: "StatusNotification" },
          ]}
          value={selectedMessageForTrigger}
        />
      </div>
      {selectedMessageForTrigger === "MeterValues" ||
      selectedMessageForTrigger === "StatusNotification" ? (
        <div style={{ marginTop: "10px" }}>
          <Input
            type="Number"
            addonBefore="Connector Id"
            onChange={(e) => setConnectorId(e?.target?.value)}
            value={connectorId}
          />
        </div>
      ) : null}
    </Modal>
  );
}
