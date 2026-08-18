"use client";

// Raise a work order — from a charger alert, a maintenance task, or by hand.
//
// Everything the source row already knows (what it is, which hub, what the
// recommended fix is) is pre-filled, so assigning a fault is a two-click job:
// pick a person, save. The same modal edits an existing order's assignment.

import { DatePicker, Form, Input, Modal, Select, Tag, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect } from "react";
import type { PortalUser, WorkOrder, WorkOrderPriority, WorkOrderSource } from "@/data/types";
import { DATE_FORMAT } from "@/lib/dateFormat";
import {
  assignableUsers,
  PRIORITY_TAG_COLOR,
  WORK_ORDER_PRIORITIES,
} from "./workOrderUtils";

const { Text } = Typography;
const { TextArea } = Input;

export interface AssignPrefill {
  source: WorkOrderSource;
  sourceId: string | null;
  /** null when raised by hand — the modal then asks what it applies to. */
  subject: string | null;
  subjectHref: string | null;
  hub: string | null;
  title: string;
  details: string | null;
  priority: WorkOrderPriority;
  dueDate?: string | null;
}

export interface AssignPayload {
  /** Only set when the modal had to ask (manual work orders). */
  subject?: string;
  title: string;
  details: string | null;
  assigneeId: string | null;
  priority: WorkOrderPriority;
  dueDate: string | null;
  note: string | null;
}

interface FormValues {
  subject?: string;
  title: string;
  details?: string | null;
  assigneeId?: string | null;
  priority: WorkOrderPriority;
  dueDate?: Dayjs | null;
  note?: string | null;
}

export default function AssignWorkModal({
  open,
  onClose,
  onSubmit,
  prefill,
  existing = null,
  users,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AssignPayload) => void;
  /** What the work is about. Ignored when `existing` is set. */
  prefill: AssignPrefill | null;
  /** Pass an order to edit its assignment instead of raising a new one. */
  existing?: WorkOrder | null;
  users: PortalUser[];
}) {
  const [form] = Form.useForm<FormValues>();
  const subject = existing?.subject ?? prefill?.subject ?? null;
  const hub = existing?.hub ?? prefill?.hub ?? null;
  // Raised from a row -> we already know what it is on. Raised by hand -> ask.
  const askSubject = subject === null;

  useEffect(() => {
    if (!open) return;
    const src = existing ?? prefill;
    form.setFieldsValue({
      subject: "",
      title: src?.title ?? "",
      details: src?.details ?? "",
      assigneeId: existing?.assigneeId ?? null,
      priority: src?.priority ?? "Medium",
      dueDate: src?.dueDate ? dayjs(src.dueDate) : null,
      note: "",
    });
  }, [open, existing, prefill, form]);

  const options = assignableUsers(users).map((u) => ({
    value: u.id,
    label: `${u.name} · ${u.role}`,
  }));

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => {
        form.validateFields().then((v) => {
          onSubmit({
            subject: askSubject ? v.subject?.trim() || undefined : undefined,
            title: v.title.trim(),
            details: v.details?.trim() || null,
            assigneeId: v.assigneeId ?? null,
            priority: v.priority,
            dueDate: v.dueDate ? v.dueDate.format("YYYY-MM-DD") : null,
            note: v.note?.trim() || null,
          });
        });
      }}
      okText={existing ? "Save" : "Assign work"}
      title={existing ? `Edit ${existing.ref}` : "Assign work"}
      destroyOnHidden
      width={520}
    >
      {subject !== null && (
        <div
          style={{
            background: "#fafafa",
            border: "1px solid #f0f0f0",
            borderRadius: 8,
            padding: "8px 12px",
            marginBottom: 16,
          }}
        >
          <Text strong>{subject}</Text>
          {hub && (
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              {hub}
            </Text>
          )}
        </div>
      )}

      <Form form={form} layout="vertical">
        {askSubject && (
          <Form.Item
            name="subject"
            label="Applies to"
            rules={[{ required: true, message: "Which charger or vehicle?" }]}
          >
            <Input placeholder="CP-1, Six Mile" />
          </Form.Item>
        )}

        <Form.Item
          name="title"
          label="Work to be done"
          rules={[{ required: true, message: "Please describe the work" }]}
        >
          <Input placeholder="Repair faulted connector 2" />
        </Form.Item>

        <Form.Item name="details" label="Details">
          <TextArea rows={2} placeholder="Anything the technician needs to know" />
        </Form.Item>

        <div style={{ display: "flex", gap: 12 }}>
          <Form.Item name="assigneeId" label="Assign to" style={{ flex: 1 }}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Unassigned"
              options={options}
            />
          </Form.Item>

          <Form.Item name="priority" label="Priority" style={{ width: 150 }}>
            <Select
              options={WORK_ORDER_PRIORITIES.map((p) => ({
                value: p,
                label: <Tag color={PRIORITY_TAG_COLOR[p]}>{p}</Tag>,
              }))}
            />
          </Form.Item>
        </div>

        <Form.Item name="dueDate" label="Due by">
          <DatePicker style={{ width: "100%" }} format={DATE_FORMAT} />
        </Form.Item>

        <Form.Item name="note" label={existing ? "Add a note" : "Note (optional)"}>
          <TextArea rows={2} placeholder="Recorded on the work order's activity trail" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
