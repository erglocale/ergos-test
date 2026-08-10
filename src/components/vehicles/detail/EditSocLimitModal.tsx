"use client";

import { Button, Form, InputNumber, Modal } from "antd";
import { useEffect } from "react";
import { updateRow } from "@/data/store";
import type { Vehicle } from "@/data/types";
import { message } from "@/lib/antdStatic";

// Port of the production EditVehicleModal ("Update vehicle configuration"):
// it only edits the Smart Charge (max SoC) limit. Wired to the store's
// socCapPct field.
export default function EditSocLimitModal({
  open,
  handleOpen,
  vehicle,
}: {
  open: boolean;
  handleOpen: (open: boolean) => void;
  vehicle: Vehicle;
}) {
  const [form] = Form.useForm<{ maxSocLimit: number }>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({ maxSocLimit: vehicle.socCapPct || 60 });
    }
  }, [open, vehicle, form]);

  const onFinish = (values: { maxSocLimit: number }) => {
    updateRow("vehicles", vehicle.id, { socCapPct: Number(values.maxSocLimit) });
    form.resetFields();
    message.success("Vehicle configuration updated successfully");
    handleOpen(false);
  };

  return (
    <Modal
      title="Update vehicle configuration"
      closable={false}
      open={open}
      footer={null}
      className="pb-0"
    >
      <Form
        form={form}
        layout="vertical"
        name="register"
        className="mt-4"
        onFinish={onFinish}
        initialValues={{ maxSocLimit: vehicle.socCapPct || 60 }}
        style={{ maxWidth: 600 }}
        scrollToFirstError
      >
        <Form.Item
          name="maxSocLimit"
          label="Max SoC Limit"
          className="w-full"
          rules={[
            { type: "number", message: "The input is not valid SoC!" },
            { required: true, message: "Please input maximum SoC limit!" },
          ]}
        >
          <InputNumber min={5} max={100} className="w-full" suffix="%" />
        </Form.Item>

        <div className="flex h-8 justify-end">
          <Button variant="outlined" danger onClick={() => handleOpen(false)}>
            Cancel
          </Button>
          <Form.Item className="ml-2">
            <Button type="primary" htmlType="submit">
              Update
            </Button>
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
