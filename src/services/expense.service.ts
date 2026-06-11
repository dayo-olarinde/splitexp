import { and, eq } from "drizzle-orm";
import { db, pg } from "../config/db";
import { ApiError } from "../utils/api-response";
import {
  toCents,
  toDecimal,
  validateAndCalcShares,
} from "../utils/calculations";
import type { CreateExpenseInput } from "../validations/expense.validation";
import { logger } from "../config/logger";

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

  const totalAmountCents = toCents(data.totalAmount);

  const transaction = await pg.begin(async (tx) => {
    const [newTx] = await tx`
      INSERT INTO transactions (group_id, type, split_type, payer_id, total_amount, description)
      VALUES (
        ${groupId},
        'expense',
        ${data.splitType},
        ${data.payerId},
        ${toCents(data.totalAmount)},
        ${data.description}
      )
      RETURNING *
      `;

    if (!newTx) throw new ApiError(500, "Failed to create transaction");

    const ledgerRows = [
      {
        transaction_id: newTx.id,
        group_id: groupId,
        user_id: data.payerId,
        amount: totalAmountCents,
      },
    ];

    shares.map((s) =>
      ledgerRows.push({
        transaction_id: newTx.id,
        group_id: groupId,
        user_id: s.userId,
        amount: -Math.abs(s.shareAmount),
      }),
    );

    await tx`
    INSERT INTO ledger_entries
      ${tx(ledgerRows, "transaction_id", "group_id", "user_id", "amount")}
    `;

    const netSum = ledgerRows.reduce((sum, row) => sum + row.amount, 0);
    if (netSum !== 0) {
      throw new ApiError(
        500,
        "CRITICAL ERROR: Ledger does not balance. Transaction aborted.",
      );
    }

    return { ...newTx, total_amount: toDecimal(newTx.total_amount) };
  });

  return transaction;
};

// export const listGroupExpenses = async (
//   groupId: string,
//   cursor?: string,
//   limit: number = 10,
// ) => {
//   const expenses = (await pg`
//     SELECT
//       exp.id,
//       exp.group_id,
//       exp.total_amount,
//       exp.split_type,
//       exp.category,
//       exp.description,
//       exp.created_at,
//       u.name AS payer_name
//     FROM expenses exp
//     INNER JOIN "user" u
//       On exp.payer_id = u.id
//     WHERE exp.group_id = ${groupId}
//     ${cursor ? pg`AND exp.created_at < ${cursor}::timestamptz` : pg``}
//     ORDER BY exp.created_at DESC
//     LIMIT ${limit + 1}
//     `) as unknown as any[];

//   const hasMore = expenses.length > limit;
//   if (hasMore) expenses.pop();

//   const nextCursor = hasMore ? expenses[expenses.length - 1].created_at : null;

//   return {
//     data: expenses,
//     pagination: {
//       hasMore,
//       nextCursor,
//       count: expenses.length,
//     },
//   };
// };

// export const getExpenseDetails = async (groupId: string, expenseId: string) => {
//   const expense = await db.query.expenses.findFirst({
//     where: and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)),
//     with: {
//       payer: {
//         columns: { id: true, name: true, email: true },
//       },
//       shares: {
//         with: {
//           participant: {
//             columns: { id: true, name: true, email: true },
//           },
//         },
//       },
//     },
//   });

//   if (!expense) {
//     throw new ApiError(404, "Expense not found in this group");
//   }

//   return expense;
// };

// export const deleteExpenseById = async (
//   userId: string,
//   role: string,
//   groupId: string,
//   expenseId: string,
// ) => {
//   const [targetExpense] = await pg`
//     SELECT payer_id
//     FROM expenses
//     WHERE id = ${expenseId}
//       AND group_id = ${groupId}
//   `;

//   if (!targetExpense) throw new ApiError(404, "Expense not found");

//   if (targetExpense.payer_id !== userId && role !== "admin")
//     throw new ApiError(
//       403,
//       "Only the payer or an admin can delete this expense",
//     );

//   await pg.begin(async (tx) => {
//     await tx`
//     DELETE FROM expense_shares
//     WHERE expense_id = ${expenseId}
//   `;

//     await tx`
//     DELETE FROM expenses
//     WHERE id = ${expenseId}
//   `;

//     return { deletedId: expenseId };
//   });
// };
