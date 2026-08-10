"use client";

import { ExclamationCircleFilled } from "@ant-design/icons";
import { Alert, Button, Modal, Typography } from "antd";
import { CONFIRM_BUTTON_PROPS } from "./derive";
import { message, modal } from "@/lib/antdStatic";

const { Text } = Typography;

export default function ResetChargerModal({
  isModalOpen,
  handleModalVisibility,
  cpid,
}: {
  isModalOpen: boolean;
  handleModalVisibility: (open: boolean) => void;
  cpid: string;
}) {
  const resetConfirm = (type: "Hard" | "Soft") =>
    modal.confirm({
      title: `Are you sure you want to ${type} Reset this Charger?`,
      icon: <ExclamationCircleFilled />,
      content: `When clicked the Proceed button, a ${type} Reset Message will be sent to the Chargepoint which will result in resetting the Charger\`s Configurations! This action cannot be undone!`,
      onOk() {
        message.success("Accepted");
      },
      onCancel() {},
      ...CONFIRM_BUTTON_PROPS,
    });

  return (
    <Modal
      title={
        <>
          <Text style={{ fontWeight: 300, fontSize: "15px" }}>Reset Charger</Text>{" "}
          <Text style={{ fontSize: "18px" }}>{cpid}</Text>
        </>
      }
      open={isModalOpen}
      footer={null}
      onCancel={() => handleModalVisibility(false)}
      width={520}
    >
      <Alert
        message="Following operations will send a Reset Message the the Chargepoint,
      which will result in resetting the charger configurations!"
        closable={false}
        showIcon={false}
        type="warning"
      />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "80px",
        }}
      >
        <Button
          type="primary"
          style={{ marginRight: "10px", width: "160px", fontWeight: 600 }}
          size="large"
          danger
          onClick={() => resetConfirm("Hard")}
        >
          Hard
        </Button>

        <Button
          type="primary"
          style={{ width: "160px", backgroundColor: "gray" }}
          size="large"
          onClick={() => resetConfirm("Soft")}
        >
          Soft
        </Button>
      </div>
    </Modal>
  );
}
