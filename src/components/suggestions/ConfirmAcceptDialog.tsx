"use client";

import { ThunderboltFilled } from "@ant-design/icons";
import { Button, Modal, Typography } from "antd";

const { Text } = Typography;
const ORANGE = "#F26E21";

// Custom confirmation dialog for applying a suggested SOC cap. Kept
// deliberately lightweight (no Modal.confirm) so we control the copy,
// the branded accent, and the loading state on the confirm button.
// Shared by the suggestions table (row Accept) and the drawer detail.
export default function ConfirmAcceptDialog({
  open,
  label,
  cap,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  label: string;
  cap?: number | null;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      footer={null}
      closable={false}
      centered
      width={420}
      mask={{ closable: !loading }}
      onCancel={onCancel}
    >
      <div style={{ textAlign: "center", padding: "8px 4px" }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#FEF0E6",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <ThunderboltFilled style={{ fontSize: 22, color: ORANGE }} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
          Apply charge limit?
        </div>
        <Text type="secondary" style={{ display: "block", fontSize: 13 }}>
          This sets the Smart Charge Limit for <Text strong>{label}</Text> to
        </Text>
        <div
          style={{ fontSize: 30, fontWeight: 800, color: ORANGE, margin: "10px 0" }}
        >
          {cap}%
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <Button block onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            block
            type="primary"
            loading={loading}
            onClick={onConfirm}
            style={{ background: ORANGE, borderColor: ORANGE }}
          >
            Apply limit
          </Button>
        </div>
      </div>
    </Modal>
  );
}
