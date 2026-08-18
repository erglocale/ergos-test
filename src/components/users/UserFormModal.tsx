"use client";

import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import type { PortalUser } from "@/data/types";

export interface UserFormValues {
  name: string;
  email: string;
  phone: string;
  role: PortalUser["role"];
}

// Shared invite/edit modal for the Users screen. Invite creates a new
// "Invited" portal user; edit patches the existing row.
export default function UserFormModal({
  open,
  user,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  user: PortalUser | null; // null = invite flow
  onCancel: () => void;
  onSubmit: (values: UserFormValues) => void;
}) {
  const [form] = Form.useForm<UserFormValues>();
  const isEdit = !!user;

  useEffect(() => {
    if (open) {
      if (user) {
        form.setFieldsValue({
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        });
      } else {
        form.resetFields();
      }
    }
  }, [open, user, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      onSubmit(values);
      form.resetFields();
    } catch {
      // validation error — keep the modal open
    }
  };

  return (
    <Modal
      title={isEdit ? "Edit User" : "Invite User"}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText={isEdit ? "Save" : "Send Invite"}
    >
      <Form form={form} layout="vertical" initialValues={{ role: "Viewer" }}>
        <Form.Item
          name="name"
          label="Name"
          rules={[{ required: true, message: "Please enter a name" }]}
        >
          <Input placeholder="Full name" />
        </Form.Item>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: "Please enter an email" },
            { type: "email", message: "Enter a valid email" },
          ]}
        >
          <Input placeholder="name@company.com" />
        </Form.Item>
        <Form.Item
          name="phone"
          label="Phone"
          rules={[{ required: true, message: "Please enter a phone number" }]}
        >
          <Input placeholder="+91 9812345678" />
        </Form.Item>
        <Form.Item name="role" label="Role" rules={[{ required: true }]}>
          <Select
            options={[
              { value: "Admin", label: "Admin" },
              { value: "Fleet Manager", label: "Fleet Manager" },
              { value: "Technician", label: "Technician" },
              { value: "Viewer", label: "Viewer" },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
