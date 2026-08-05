"use client";

import {
  Button,
  Form,
  InputNumber,
  message,
  Modal,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import UserDetailsModal from "@/components/users/UserDetailsModal";
import { updateRow, useDb } from "@/data/store";
import type { PortalUser, Wallet } from "@/data/types";

const { Title, Text } = Typography;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface WalletTxn {
  id: string;
  orderId: string;
  UserId: string;
  amount: number;
  reason: string;
  createdAt: string;
}

// Fixtures carry no transaction ledger — derive a deterministic recent-history
// list from each wallet (id/orderId/amount/reason are synthesized).
function deriveTransactions(wallets: Wallet[]): WalletTxn[] {
  const txns: WalletTxn[] = [];
  for (const w of wallets) {
    const count = Math.min(5, Math.max(1, w.txnCount % 6));
    for (let i = 0; i < count; i += 1) {
      const h = hash(`${w.id}-${i}`);
      const deposit = h % 3 === 0;
      txns.push({
        id: `txn-${w.id}-${i + 1}`,
        orderId: `ord-${(h % 900000) + 100000}`,
        UserId: w.id,
        amount: Math.round(((h % 40000) / 100 + 50) * 100) / 100,
        reason: deposit ? "WALLET_DEPOSIT" : "CHARGING_DEBIT",
        createdAt: dayjs(w.lastTopUpAt)
          .subtract(i * 3 + (h % 3), "day")
          .toISOString(),
      });
    }
  }
  return txns.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export default function WalletsPage() {
  const db = useDb();
  const wallets = db.wallets;
  const [detailUser, setDetailUser] = useState<PortalUser | null>(null);
  const [topUpTarget, setTopUpTarget] = useState<Wallet | null>(null);
  const [topUpForm] = Form.useForm<{ amount: number }>();
  const [messageApi, contextHolder] = message.useMessage();

  const transactions = useMemo(() => deriveTransactions(wallets), [wallets]);

  const viewUser = (wallet: Wallet) => {
    const user = db.users.find((u) => u.name === wallet.userName);
    if (user) {
      setDetailUser(user);
    } else {
      messageApi.info("No portal user linked to this wallet.");
    }
  };

  const handleTopUp = async () => {
    if (!topUpTarget) return;
    try {
      const { amount } = await topUpForm.validateFields();
      updateRow("wallets", topUpTarget.id, {
        balance: Math.round((topUpTarget.balance + amount) * 100) / 100,
        lastTopUpAt: dayjs().toISOString(),
        txnCount: topUpTarget.txnCount + 1,
      });
      messageApi.success(
        `₹${amount.toFixed(2)} added to ${topUpTarget.userName}'s wallet`,
      );
      setTopUpTarget(null);
      topUpForm.resetFields();
    } catch {
      // validation error
    }
  };

  const columnsWalletBalanceTable: TableProps<Wallet>["columns"] = [
    {
      title: "User Id",
      dataIndex: "id",
      key: "UserId",
      render: (_text: string, wallet) => <Text copyable>{wallet.id}</Text>,
    },
    {
      title: "Phone Number",
      dataIndex: "phone",
      key: "phone",
      render: (_text: string, wallet) => <Text>{wallet.phone}</Text>,
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      render: (_text: string, wallet) => (
        <Text>
          {db.users.find((u) => u.name === wallet.userName)?.email ?? "—"}
        </Text>
      ),
    },
    {
      title: "Wallet Balance",
      dataIndex: "balance",
      key: "Balance",
      render: (_text: number, wallet) => (
        <Text style={{ fontWeight: 600 }}>
          ₹{wallet.balance.toFixed(2)}
        </Text>
      ),
    },
    {
      title: "Actions",
      dataIndex: "actions",
      key: "actions",
      render: (_text, wallet) => (
        <>
          <Button
            type="text"
            style={{ color: "#f97417" }}
            onClick={() => viewUser(wallet)}
          >
            View User
          </Button>
          <Button
            type="text"
            style={{ color: "#f97417" }}
            onClick={() => setTopUpTarget(wallet)}
          >
            Top Up
          </Button>
        </>
      ),
    },
  ];

  const columnsWalletTransactionsTable: TableProps<WalletTxn>["columns"] = [
    {
      title: "Transaction Id",
      dataIndex: "id",
      key: "id",
      render: (text: string) => <Text copyable>{text}</Text>,
    },
    {
      title: "Order Id",
      dataIndex: "orderId",
      key: "orderId",
      render: (text: string) => <Text copyable>{text}</Text>,
    },
    {
      title: "User Id",
      dataIndex: "UserId",
      key: "UserId",
      render: (text: string) => <Text copyable>{text}</Text>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (_text: number, transaction) => (
        <Text
          style={{
            color: transaction.reason.endsWith("DEPOSIT")
              ? "#16a34a"
              : "#ef4444",
            fontWeight: 600,
          }}
        >
          ₹ {transaction.amount}
        </Text>
      ),
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      render: (_text: string, transaction) => (
        <Tag
          color={transaction.reason.endsWith("DEPOSIT") ? "#16a34a" : "#ef4444"}
        >
          {transaction.reason}
        </Tag>
      ),
    },
    {
      title: "Created At",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (_text: string, transaction) => (
        <>{dayjs(transaction.createdAt).format("DD MMM YYYY, hh:mm A")}</>
      ),
    },
  ];

  return (
    <>
      {contextHolder}
      <div>
        <Title level={3} style={{ marginBottom: "10px" }}>
          Wallets
        </Title>
      </div>

      <Tabs
        defaultActiveKey="walletBalance"
        items={[
          {
            key: "walletBalance",
            label: "Wallet Balance",
            children: (
              <Table
                rowKey="id"
                columns={columnsWalletBalanceTable}
                dataSource={wallets}
                pagination={false}
              />
            ),
          },
          {
            key: "walletTransactions",
            label: "Wallet Transactions",
            children: (
              <Table
                rowKey="id"
                columns={columnsWalletTransactionsTable}
                dataSource={transactions}
                pagination={false}
              />
            ),
          },
        ]}
      />

      <UserDetailsModal
        open={!!detailUser}
        user={detailUser}
        onClose={() => setDetailUser(null)}
      />

      <Modal
        title={topUpTarget ? `Top up — ${topUpTarget.userName}` : "Top up"}
        open={!!topUpTarget}
        onCancel={() => setTopUpTarget(null)}
        onOk={handleTopUp}
        okText="Add Money"
      >
        <Form form={topUpForm} layout="vertical" initialValues={{ amount: 500 }}>
          <Form.Item
            name="amount"
            label="Amount (₹)"
            rules={[{ required: true, message: "Enter an amount" }]}
          >
            <InputNumber min={1} step={100} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
