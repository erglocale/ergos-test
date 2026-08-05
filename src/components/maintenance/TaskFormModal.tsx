"use client";

import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect } from "react";
import type { MaintenanceTask } from "@/data/types";

export interface TaskFormVehicle {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
  odometerKm: number | null;
}

export interface TaskFormPayload {
  evId: string;
  taskType: "FLEET_TASK" | "OEM_SERVICE";
  title: string;
  description: string | null;
  isRecurring: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  dueKm: number | null;
  dueDate: string | null; // YYYY-MM-DD
  currentOdometerKm: number | null;
}

interface TaskFormValues {
  evId: string;
  taskType: "FLEET_TASK" | "OEM_SERVICE";
  title: string;
  description?: string | null;
  isRecurring?: boolean;
  intervalKm?: number | null;
  intervalMonths?: number | null;
  dueKm?: number | null;
  dueDate?: Dayjs | null;
  currentOdometerKm?: number | null;
}

// Create / edit a maintenance task. Pass `task` to edit, null to create.
export default function TaskFormModal({
  open,
  onClose,
  onSubmit,
  task,
  vehicles,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: TaskFormPayload) => void;
  task: MaintenanceTask | null;
  vehicles: TaskFormVehicle[];
  loading: boolean;
}) {
  const [form] = Form.useForm<TaskFormValues>();
  const isEdit = !!task;

  const selectedEvId = Form.useWatch("evId", form);
  const isRecurring = Form.useWatch("isRecurring", form);
  // Sandbox replacement for useEvOdometer: read the known odometer straight
  // from the selected vehicle row.
  const odometerInfo =
    !isEdit && open && selectedEvId
      ? {
          currentKm:
            vehicles.find((v) => v.id === selectedEvId)?.odometerKm ?? null,
        }
      : null;
  const hasAnchor = odometerInfo?.currentKm != null;

  useEffect(() => {
    if (!open) return;
    if (task) {
      form.setFieldsValue({
        evId: task.evId,
        taskType: task.taskType,
        title: task.title,
        description: task.description,
        isRecurring: task.isRecurring,
        intervalKm: task.intervalKm,
        intervalMonths: task.intervalMonths,
        dueKm: task.dueKm != null ? Number(task.dueKm) : null,
        dueDate: task.dueDate ? dayjs(task.dueDate) : null,
      });
    } else {
      form.resetFields();
    }
  }, [open, task, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    const payload: TaskFormPayload = {
      evId: values.evId,
      taskType: values.taskType,
      title: values.title,
      description: values.description ?? null,
      isRecurring: !!values.isRecurring,
      intervalKm: values.intervalKm ?? null,
      intervalMonths: values.intervalMonths ?? null,
      dueKm: values.dueKm ?? null,
      dueDate: values.dueDate ? values.dueDate.format("YYYY-MM-DD") : null,
      currentOdometerKm: values.currentOdometerKm ?? null,
    };
    onSubmit(payload);
  };

  return (
    <Modal
      title={isEdit ? "Edit maintenance task" : "New maintenance task"}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText={isEdit ? "Save changes" : "Create task"}
      confirmLoading={loading}
      destroyOnHidden
      width={520}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ taskType: "FLEET_TASK", isRecurring: false }}
      >
        <Form.Item
          name="evId"
          label="Vehicle"
          rules={[{ required: true, message: "Select a vehicle" }]}
        >
          <Select
            placeholder="Select vehicle"
            disabled={isEdit}
            showSearch
            optionFilterProp="label"
            options={(vehicles || []).map((v) => ({
              value: v.id,
              label: `${v.licensePlate || `EV #${v.id}`}${
                v.make ? ` — ${v.make} ${v.model || ""}` : ""
              }`,
            }))}
          />
        </Form.Item>

        <Form.Item name="taskType" label="Task type">
          <Radio.Group>
            <Radio.Button value="FLEET_TASK">Fleet task</Radio.Button>
            <Radio.Button value="OEM_SERVICE">OEM service</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="title"
          label="Title"
          rules={[{ required: true, message: "Enter a title" }]}
        >
          <Input placeholder="e.g. Full service, Tyre rotation" />
        </Form.Item>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="Optional details" />
        </Form.Item>

        <Form.Item
          name="isRecurring"
          label="Recurring"
          valuePropName="checked"
          tooltip="On completion the next due point is scheduled automatically from the intervals below"
        >
          <Switch />
        </Form.Item>

        {isRecurring && (
          <div style={{ display: "flex", gap: 12 }}>
            <Form.Item name="intervalKm" label="Every (km)" style={{ flex: 1 }}>
              <InputNumber
                min={1}
                style={{ width: "100%" }}
                placeholder="e.g. 30000"
              />
            </Form.Item>
            <Form.Item
              name="intervalMonths"
              label="Every (months)"
              style={{ flex: 1 }}
            >
              <InputNumber
                min={1}
                style={{ width: "100%" }}
                placeholder="e.g. 12"
              />
            </Form.Item>
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item
            name="dueKm"
            label="Due at (km)"
            style={{ flex: 1 }}
            tooltip={
              isRecurring
                ? "Leave empty to derive from the km interval and the current odometer"
                : "Odometer reading at which this task is due"
            }
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 60000"
            />
          </Form.Item>
          <Form.Item
            name="dueDate"
            label="Due by (date)"
            style={{ flex: 1 }}
            tooltip={
              isRecurring
                ? "Leave empty to derive from the months interval"
                : undefined
            }
          >
            <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" />
          </Form.Item>
        </div>

        {!isEdit && (
          <Form.Item
            name="currentOdometerKm"
            label="Current odometer (km)"
            tooltip="Used as the starting point for km tracking — distance driven is added automatically from telematics"
            extra={
              selectedEvId
                ? hasAnchor
                  ? `Known reading: ~${Number(odometerInfo!.currentKm).toLocaleString()} km — enter a value only to recalibrate`
                  : "No odometer reading recorded for this vehicle yet — required for km-based tracking"
                : null
            }
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 42500"
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
