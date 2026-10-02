import { and, desc, eq, or } from "drizzle-orm";
import { db, pg } from "../config/db";
import { transactions } from "../db/schema";
import { ApiError } from "../utils/api-response";
import { toDecimal, toKobo } from "../utils/calculations";
import type { CreateSettlementInput } from "../validations/settlement.validation";

export const logSettlement = async (
  groupId: string,
  payerId: string,
  data: CreateSettlementInput,
) => {
  if (payerId === data.payeeId)
    throw new ApiError(400, "You cannot settle a debt with yourself");

  const amountKobo = toKobo(data.amount);

  const settlement = await pg.begin(async (tx) => {
    const members = await tx`
      SELECT user_id
      FROM group_members
      WHERE group_id = ${groupId}
        AND user_id IN (${data.payeeId}, ${payerId})
      FOR SHARE
      `;

    if (members.length !== 2)
      throw new ApiError(
        400,
        "Both payer and payee must be members of this group",
      );

    const [insertedTransaction] = await tx`
      INSERT INTO transactions (group_id, type, status, payer_id, payee_id, total_amount, description)
      VALUES (
        ${groupId}, 
        'settlement',
        'pending',
        ${payerId}, 
        ${data.payeeId}, 
        ${amountKobo}, 
        ${data.description}
      )
      ON CONFLICT (group_id, payer_id, payee_id)
        WHERE type = 'settlement' AND status = 'pending'
      DO NOTHING
      RETURNING id, group_id, type, status, description, total_amount, 
        payer_id, payee_id
      `;

    if (!insertedTransaction)
      throw new ApiError(
        409,
        "You already have a pending settlement with this user. Wait for them to confirm it.",
      );

    const ledgerEntry = [
      {
        transaction_id: insertedTransaction.id,
        group_id: groupId,
        user_id: payerId,
        amount: amountKobo,
      },
      {
        transaction_id: insertedTransaction.id,
        group_id: groupId,
        user_id: data.payeeId,
        amount: -amountKobo,
      },
    ];

    await tx`
      INSERT INTO ledger_entries ${tx(ledgerEntry, "transaction_id", "group_id", "user_id", "amount")}
    `;

    const netSum = ledgerEntry.reduce((sum, e) => sum + Number(e.amount), 0);
    if (netSum !== 0)
      throw new ApiError(500, "Ledger imbalance. Settlement aborted");

    return insertedTransaction;
  });

  return { ...settlement, total_amount: toDecimal(settlement.total_amount) };
};

export const fetchGroupSettlements = async (groupId: string) => {
  const allSettlements = await db.query.transactions.findMany({
    where: and(
      eq(transactions?.groupId, groupId),
      eq(transactions?.type, "settlement"),
    ),
    columns: {
      id: true,
      status: true,
      description: true,
      totalAmount: true,
      createdAt: true,
    },
    orderBy: [desc(transactions.createdAt)],
    with: {
      payer: {
        columns: { id: true, name: true, email: true },
      },
      payee: {
        columns: { id: true, name: true, email: true },
      },
    },
  });

  return allSettlements.map((s) => ({
    ...s,
    totalAmount: toDecimal(s.totalAmount ?? 0),
  }));
};

export const confirmSettlement = async (
  userId: string,
  groupId: string,
  settlementId: string,
) => {
  const confirmedTransaction = await pg.begin(async (tx) => {
    const [transaction] = await tx`
    SELECT id, status, payee_id
    FROM transactions
    WHERE id = ${settlementId} 
      AND group_id= ${groupId}
      AND type = 'settlement'
    FOR UPDATE
    `;

    if (!transaction) throw new ApiError(404, "Settlement not found");

    if (transaction.status !== "pending")
      throw new ApiError(
        400,
        `This settlement is already ${transaction.status}`,
      );

    if (transaction.payee_id !== userId)
      throw new ApiError(
        403,
        "You are not authorised to confirm this settlement",
      );

    const [updatedTransaction] = await tx`
      UPDATE transactions
      SET status = 'confirmed'
      WHERE id = ${settlementId}
      RETURNING id, group_id, type, status, description, total_amount, 
        payer_id, payee_id
    `;

    return {
      ...updatedTransaction,
      total_amount: toDecimal(updatedTransaction?.total_amount),
    };
  });

  return confirmedTransaction;
};

export const rejectSettlement = async (
  userId: string,
  groupId: string,
  settlementId: string,
) => {
  return await pg.begin(async (tx) => {
    const [transaction] = await tx`
    SELECT id, status, payee_id, payer_id
    FROM transactions
    WHERE id = ${settlementId} 
      AND group_id= ${groupId}
      AND type = 'settlement'
      AND status = 'pending'
    FOR UPDATE
    `;

    if (!transaction) throw new ApiError(404, "Pending settlement not found");

    if (transaction.status !== "pending")
      throw new ApiError(
        400,
        `You cannot reject a settlement that is already ${transaction.status}`,
      );

    if (transaction.payee_id !== userId && transaction.payer_id !== userId)
      throw new ApiError(
        403,
        "You are not authorised to confirm this settlement",
      );

    const [rejectedSettlement] = await tx`
      DELETE FROM transactions
      WHERE id = ${settlementId}
      RETURNING *
    `;

    return rejectedSettlement;
  });
};

export const settlementDetail = async (
  userId: string,
  groupId: string,
  settlementId: string,
) => {
  const settlement = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.groupId, groupId),
      eq(transactions.id, settlementId),
      or(eq(transactions.payerId, userId), eq(transactions.payeeId, userId)),
    ),
    columns: {
      id: true,
      groupId: true,
      type: true,
      status: true,
      description: true,
      totalAmount: true,
      createdAt: true,
    },
    with: {
      payer: {
        columns: { id: true, name: true, email: true },
      },
      payee: {
        columns: { id: true, name: true, email: true },
      },
    },
  });

  if (!settlement) {
    throw new ApiError(
      404,
      "Settlement not found or you are not authorized to view it",
    );
  }

  return {
    ...settlement,
    totalAmount: toDecimal(settlement.totalAmount ?? 0),
  };
};
