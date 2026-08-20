"use client";

// Book a vehicle in with a garage, or revise the visit once it is there.
// A service is rarely same-day, so this is the state between "due" and "done":
// it records who has the vehicle and when they say it is coming back, which is
// what the fleet manager chases when the date slips.

import { Button, DatePicker, Form, Input, Modal } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect } from "react";
import type { EnrichedMaintenanceTask } from "./derive";
import { DATE_FORMAT } from "@/lib/dateFormat";

export interface StartServicePayload {
  startedAt: string; // YYYY-MM-DD
  expectedReturn: string | null; // YYYY-MM-DD
  vendor: string | null;
  note: string | null;
}

interface StartServiceValues {
  startedAt: Dayjs;
  expectedReturn?: Dayjs | null;
  vendor?: string | null;
  note?: string | null;
}

export default function StartServiceModal({
  open,
  onClose,
  onSubmit,
  onCancelVisit,
  task,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: StartServicePayload) => void;
  /** Called when the vehicle came back without the work being done. */
  onCancelVisit: () => void;
  task: EnrichedMaintenanceTask | null;
  loading: boolean;
}) {
  const [form] = Form.useForm<StartServiceValues>();
  const visit = task?.visit ?? null;
  const isEdit = !!visit;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      startedAt: visit ? dayjs(visit.startedAt) : dayjs(),
      expectedReturn: visit?.expectedReturn ? dayjs(visit.expectedReturn) : null,
      vendor: visit?.vendor ?? null,
      note: visit?.note ?? null,
    });
  }, [open, visit, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit({
      startedAt: values.startedAt.format("YYYY-MM-DD"),
      expectedReturn: values.expectedReturn
        ? values.expectedReturn.format("YYYY-MM-DD")
        : null,
      vendor: values.vendor?.trim() || null,
      note: values.note?.trim() || null,
    });
  };

  return (
    <Modal
      title={isEdit ? "Update service visit" : "Send for service"}
      open={open}
      onCancel={onClose}
      okText={isEdit ? "Save visit" : "Send for service"}
      confirmLoading={loading}
      destroyOnHidden
      width={480}
      footer={[
        isEdit ? (
          <Button key="cancel-visit" danger type="text" onClick={onCancelVisit}>
            Vehicle came back — cancel visit
          </Button>
        ) : null,
        <Button key="close" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="ok" type="primary" loading={loading} onClick={handleOk}>
          {isEdit ? "Save visit" : "Send for service"}
        </Button>,
      ]}
    >
      <p style={{ marginTop: 0, marginBottom: 16, color: "#64748b" }}>
        {task?.title}
        {task?.Ev?.licensePlate ? ` — ${task.Ev.licensePlate}` : ""}. The vehicle
        is marked off the road until the service is logged.
      </p>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="vendor"
          label="Garage / vendor"
          rules={[{ required: true, message: "Who has the vehicle?" }]}
        >
          <Input placeholder="e.g. Sai Motors" />
        </Form.Item>

        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item
            name="startedAt"
            label="Booked in"
            style={{ flex: 1 }}
            rules={[{ required: true, message: "Select the date" }]}
          >
            <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
          </Form.Item>
          <Form.Item
            name="expectedReturn"
            label="Expected back"
            style={{ flex: 1 }}
            tooltip="The row turns red if the vehicle is still in after this date"
          >
            <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
          </Form.Item>
        </div>

        <Form.Item name="note" label="Note">
          <Input.TextArea
            rows={2}
            placeholder="e.g. Awaiting brake pads from OEM"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
