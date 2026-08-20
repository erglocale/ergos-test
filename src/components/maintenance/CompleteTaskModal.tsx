"use client";

import { Form, Input, InputNumber, Modal, DatePicker } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect } from "react";
import type { EnrichedMaintenanceTask } from "./derive";
import { DATE_FORMAT } from "@/lib/dateFormat";

export interface CompleteTaskPayload {
  serviceDate: string; // YYYY-MM-DD
  odometerKm: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
}

interface CompleteTaskValues {
  serviceDate: Dayjs;
  odometerKm?: number | null;
  cost?: number | null;
  vendor?: string | null;
  notes?: string | null;
}

// Mark a task as done and log the service record. For recurring tasks the
// backend rolls the next due point forward from the odometer entered here.
export default function CompleteTaskModal({
  open,
  onClose,
  onSubmit,
  task,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CompleteTaskPayload) => void;
  task: EnrichedMaintenanceTask | null;
  loading: boolean;
}) {
  const [form] = Form.useForm<CompleteTaskValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      // Coming back from a garage: the service ended today, and the garage
      // that has had it is almost always the one to bill against.
      serviceDate: dayjs(),
      odometerKm: task?.currentKm != null ? Math.round(task.currentKm) : null,
      cost: null,
      vendor: task?.visit?.vendor ?? null,
      notes: task?.visit?.note ?? null,
    });
  }, [open, task, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    onSubmit({
      serviceDate: values.serviceDate.format("YYYY-MM-DD"),
      odometerKm: values.odometerKm ?? null,
      cost: values.cost ?? null,
      vendor: values.vendor ?? null,
      notes: values.notes ?? null,
    });
  };

  return (
    <Modal
      title="Complete task"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="Complete & log service"
      confirmLoading={loading}
      destroyOnHidden
      width={480}
    >
      <p style={{ marginTop: 0, marginBottom: task?.visit ? 8 : 16, color: "#64748b" }}>
        {task?.title}
        {task?.Ev?.licensePlate ? ` — ${task.Ev.licensePlate}` : ""}
        {task?.isRecurring
          ? ". The next occurrence will be scheduled automatically."
          : ""}
      </p>
      {task?.visit && (
        <p style={{ marginTop: 0, marginBottom: 16, color: "#d97706", fontSize: 13 }}>
          Off the road since{" "}
          {dayjs(task.visit.startedAt).format("DD MMM YYYY")}
          {task.daysInService != null
            ? ` · ${task.daysInService} ${task.daysInService === 1 ? "day" : "days"}`
            : ""}
          . Completing this puts it back in service.
        </p>
      )}
      <Form form={form} layout="vertical" requiredMark={false}>
        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item
            name="serviceDate"
            label="Service date"
            style={{ flex: 1 }}
            rules={[{ required: true, message: "Select the service date" }]}
          >
            <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
          </Form.Item>
          <Form.Item
            name="odometerKm"
            label="Odometer (km)"
            style={{ flex: 1 }}
            tooltip="Reading at service time — keeps km tracking calibrated"
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item name="cost" label="Cost" style={{ flex: 1 }}>
            <InputNumber min={0} style={{ width: "100%" }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="vendor" label="Vendor / garage" style={{ flex: 1 }}>
            <Input placeholder="e.g. Sai Motors" />
          </Form.Item>
        </div>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea rows={2} placeholder="Optional notes" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
