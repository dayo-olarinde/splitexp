import { and, eq } from "drizzle-orm";
import { db, pg } from "../config/db";
import { ApiError } from "../utils/api-response";
import { validateAndCalcShares } from "../utils/expenseCalc";
import type { CreateExpenseInput } from "../validations/expense.validation";
import { verifyGroup } from "./group.service";
import { expenses } from "../db/schema";

export const logExpense = async (groupId: string, data: CreateExpenseInput) => {
  const uniqueUserIds = Array.from(
    new Set([data.payerId, ...data.participants.map((p) => p.userId)]),
  );

  const memberRows = await pg`
  SELECT user_id
  FROM group_members
  WHERE group_id = ${groupId}
    AND user_id = ANY(${uniqueUserIds}::text[])
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

  const expense = await pg.begin(async (tx) => {
    const [newExpense] = await tx`
      INSERT INTO expenses (group_id, payer_id, total_amount, split_type, category, description)
      VALUES (
        ${groupId},
        ${data.payerId},
        ${data.totalAmount},
        ${data.splitType},
        ${data.category ?? null},
        ${data.description}
      )
      RETURNING *
      `;

    if (!newExpense) throw new ApiError(500, "Failed to create expense");

    const shareValues = shares.map((s) => ({
      expense_id: newExpense.id,
      user_id: s.userId,
      share_amount: s.shareAmount,
    }));

    await tx`
    INSERT INTO expense_shares ${tx(shareValues, "expense_id", "user_id", "share_amount")}
    `;

    return newExpense;
  });

  return expense;
};

export const listGroupExpenses = async (
  groupId: string,
  cursor?: string,
  limit: number = 10,
) => {
  const expenses = (await pg`
    SELECT 
      exp.id,
      exp.group_id,
      exp.total_amount,
      exp.split_type,
      exp.category,
      exp.description,
      exp.created_at,
      u.name AS payer_name
    FROM expenses exp
    INNER JOIN "user" u
      On exp.payer_id = u.id
    WHERE exp.group_id = ${groupId}
    ${cursor ? pg`AND exp.created_at < ${cursor}::timestamptz` : pg``}
    ORDER BY exp.created_at DESC
    LIMIT ${limit + 1}
    `) as unknown as any[];

  const hasMore = expenses.length > limit;
  if (hasMore) expenses.pop();

  const nextCursor = hasMore ? expenses[expenses.length - 1].created_at : null;

  return {
    data: expenses,
    pagination: {
      hasMore,
      nextCursor,
      count: expenses.length,
    },
  };
};

export const getExpenseDetails = async (groupId: string, expenseId: string) => {
  const expense = await db.query.expenses.findFirst({
    where: and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)),
    with: {
      payer: {
        columns: { id: true, name: true, email: true },
      },
      shares: {
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

  return expense;
};

export const deleteExpenseById = async (
  userId: string,
  role: string,
  groupId: string,
  expenseId: string,
) => {
  const [targetExpense] = await pg`
    SELECT payer_id
    FROM expenses
    WHERE id = ${expenseId}
      AND group_id = ${groupId}
  `;

  if (!targetExpense) throw new ApiError(404, "Expense not found");

  if (targetExpense.payer_id !== userId && role !== "admin")
    throw new ApiError(
      403,
      "Only the payer or an admin can delete this expense",
    );

  await pg.begin(async (tx) => {
    await tx`
    DELETE FROM expense_shares
    WHERE expense_id = ${expenseId}
  `;

    await tx`
    DELETE FROM expenses
    WHERE id = ${expenseId}
  `;

    return { deletedId: expenseId };
  });
};
