"use client";

import { Card, Table, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { CircleCheckBig, Clock, OctagonX } from "lucide-react";
import Link from "next/link";
import { useDb } from "@/data/store";
import type { Driver } from "@/data/types";
import getDocumentSummaryByEntity from "./documents";

const { Text } = Typography;

function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = name.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

export default function DriversList() {
  const db = useDb();
  const drivers = db.drivers;

  const columns: TableColumnsType<Driver> = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (_: unknown, obj) => {
        const { firstName, lastName } = splitName(obj.name);
        return (
          <Link href={`/drivers/${obj.id}`}>
            <Text style={{ color: "#f97417" }}>
              {firstName} {lastName}
            </Text>
          </Link>
        );
      },
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Phone Number",
      dataIndex: "phone",
      key: "phone",
    },
    {
      title: "Driver Id",
      dataIndex: "id",
      key: "id",
      render: (text: string) => <Text copyable>{text}</Text>,
    },
    {
      title: "Added On",
      dataIndex: "joinedAt",
      key: "joinedAt",
      render: (_: unknown, obj) => <>{dayjs(obj.joinedAt).format("DD MMM YYYY")}</>,
    },
    {
      title: "Documents",
      dataIndex: "documents",
      key: "documents",
      fixed: "right",
      width: 210,
      render: (_: unknown, driver) => {
        const documentSummary = getDocumentSummaryByEntity(driver.id);
        return (
          <div className="flex flex-wrap items-center justify-center gap-1">
            {documentSummary.verified > 0 && (
              <Tooltip
                placement="top"
                title={`Verified documents: ${documentSummary.verified}`}
              >
                <div className="flex items-center gap-1 rounded-md bg-green-100 px-2 py-1">
                  <CircleCheckBig className="h-4 w-4 text-green-500" />{" "}
                  <p className="font-bold text-green-700">
                    {documentSummary.verified}
                  </p>
                </div>
              </Tooltip>
            )}
            {documentSummary.pending > 0 && (
              <Tooltip
                placement="top"
                title={`Pending verification: ${documentSummary.pending}`}
              >
                <div className="flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-1">
                  <Clock className="h-4 w-4 text-yellow-500" />{" "}
                  <p className="font-bold text-yellow-700">
                    {documentSummary.pending}
                  </p>
                </div>
              </Tooltip>
            )}

            {documentSummary.rejected > 0 && (
              <Tooltip
                placement="top"
                title={`Rejected documents: ${documentSummary.rejected}`}
              >
                <div className="flex items-center gap-1 rounded-md bg-red-100 px-2 py-1">
                  <OctagonX className="h-4 w-4 text-red-500" />{" "}
                  <p className="font-bold text-red-700">
                    {documentSummary.rejected}
                  </p>
                </div>
              </Tooltip>
            )}

            <Tooltip
              placement="top"
              title={`Total documents uploaded: ${documentSummary.total}`}
            >
              <div className="flex items-center gap-1 rounded-md bg-gray-200 px-2 py-1">
                Total:{" "}
                <p className="text-black-700 font-bold">{documentSummary.total}</p>
              </div>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  return (
    <Card
      style={{
        width: "100%",
        borderRadius: "12px",
        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        border: "1px solid #f0f0f0",
      }}
      bodyStyle={{ padding: 0 }}
      hoverable
    >
      <Table
        columns={columns}
        dataSource={drivers}
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        bordered={false}
        rowClassName={() => "custom-table-row"}
        className="styled-drivers-table"
      />
    </Card>
  );
}
