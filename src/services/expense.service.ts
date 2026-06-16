import { and, eq } from "drizzle-orm";
import { db, pg } from "../config/db";
import { transactions } from "../db/schema";
import { ApiError } from "../utils/api-response";
import {
  toDecimal,
  toKobo,
  validateAndCalcShares,
} from "../utils/calculations";
import type { CreateExpenseInput } from "../validations/expense.validation";

export const logExpense = async (groupId: string, data: CreateExpenseInput) => {
  const uniqueUserIds = [
    ...new Set([data.payerId, ...data.participants.map((p) => p.userId)]),
  ];

  const memberRows = await pg`
    SELECT user_id
    FROM group_members
    WHERE group_id = ${groupId}
      AND user_id = ANY(${uniqueUserIds}::ltext[])
  `;

  const validIdsSet = new Set(memberRows.map((row) => row.user_id));
  const nonMembers = uniqueUserIds.filter((id) => !validIdsSet.has(id));

  if (nonMembers.length > 0) {
    throw new ApiError(
      400,
      `The following users are not members of this group: ${nonMembers.join(", ")}`,
    );
  }

  const shares = validateAndCalcShares(
    data.totalAmount,
    data.splitType,
    data.participants,
  );
  const totalAmountKobo = toKobo(data.totalAmount);

  const transaction = await pg.begin(async (tx) => {
    const [newTx] = await tx`
      INSERT INTO transactions (group_id, type, split_type, payer_id, total_amount, description, category)
      VALUES (
        ${groupId},
        'expense',
        ${data.splitType},
        ${data.payerId},
        ${totalAmountKobo},
        ${data.description},
        ${data.category}
      )
      RETURNING *
      `;

    if (!newTx) throw new ApiError(500, "Failed to create transaction");

    const ledgerRows = [
      {
        transaction_id: newTx.id,
        group_id: groupId,
        user_id: data.payerId,
        amount: totalAmountKobo,
      },

      ...shares.map((s) => ({
        transaction_id: newTx.id,
        group_id: groupId,
        user_id: s.userId,
        amount: -Math.abs(s.shareAmount),
      })),
    ];

    await tx`
    INSERT INTO ledger_entries
      ${tx(ledgerRows, "transaction_id", "group_id", "user_id", "amount")}
    `;

    return { ...newTx, total_amount: toDecimal(newTx.total_amount) };
  });

  return transaction;
};

export const listExpenses = async (
  groupId: string,
  cursor?: string,
  limit: number = 10,
) => {
  const expenses = (await pg`
    SELECT t.id, t.group_id, t.total_amount, t.split_type, t.category, 
      t.description, t.created_at,

      u.name AS payer_name
    FROM transactions t
    INNER JOIN "user" u
      ON t.payer_id = u.id
    WHERE t.group_id = ${groupId}
      AND t.type = 'expense'
      ${cursor ? pg`AND t.created_at < ${cursor}::timestamptz` : pg``}
    ORDER BY t.created_at DESC
    LIMIT ${limit + 1}
    `) as unknown as any[];

  const hasMore = expenses.length > limit;
  if (hasMore) expenses.pop();

  const formattedExpenses = expenses.map((e) => ({
    ...e,
    total_amount: toDecimal(e.total_amount),
  }));

  const nextCursor = hasMore ? expenses[expenses.length - 1].created_at : null;

  return {
    expenses: formattedExpenses,
    pagination: {
      hasMore,
      nextCursor,
      count: expenses.length,
    },
  };
};

export const expenseDetails = async (
  groupId: string,
  transactionId: string,
) => {
  const expense = await db.query.transactions.findFirst({
    columns: {
      id: true,
      status: true,
      category: true,
      description: true,
      totalAmount: true,
      createdAt: true,
    },
    where: and(
      eq(transactions.id, transactionId),
      eq(transactions.groupId, groupId),
      eq(transactions.type, "expense"),
    ),
    with: {
      payer: {
        columns: { id: true, name: true, email: true },
      },
      shares: {
        columns: { id: true, currency: true, amount: true, createdAt: true },
        with: {
          participant: {
            columns: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!expense) {
    throw new ApiError(404, "Expense not found in this group");
  }

  const participantShares = expense.shares
    .filter((s) => Number(s.amount) < 0)
    .map((share) => ({
      id: share.id,
      currency: share.currency,
      amount: toDecimal(Math.abs(share.amount)),
      createdAt: share.createdAt,
      participant: share.participant,
    }));

  return {
    id: expense.id,
    description: expense.description,
    category: expense.category ?? "Uncategorized",
    totalAmount: toDecimal(expense.totalAmount ?? 0),
    createdAt: expense.createdAt,
    status: expense.status,
    payer: expense.payer,
    shares: participantShares,
  };
};

export const deleteExpense = async (
  userId: string,
  role: string,
  groupId: string,
  transactionId: string,
) => {
  const [targetExpense] = await pg`
    SELECT payer_id
    FROM transactions
    WHERE id = ${transactionId}
      AND group_id = ${groupId}
      AND type = 'expense'
  `;

  if (!targetExpense) throw new ApiError(404, "Expense not found");

  if (targetExpense.payer_id !== userId && role !== "admin")
    throw new ApiError(
      403,
      "Only the payer or an admin can delete this expense",
    );

  const [deletedExpense] = await pg`
    DELETE FROM transactions
    WHERE id = ${transactionId}
      AND group_id = ${groupId}
      AND type = 'expense'
    RETURNING id, category, description, total_amount
  `;

  return deletedExpense;
};
