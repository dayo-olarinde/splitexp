// import { and, desc, eq, or } from "drizzle-orm";
import { db, pg } from "../config/db";
import { logger } from "../config/logger";
// import { settlements } from "../db/schema";
import { ApiError } from "../utils/api-response";
import { toKobo, toDecimal } from "../utils/calculations";
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
      FOR UPDATE
      `;

    if (members.length !== 2)
      throw new ApiError(
        400,
        "Both payer and payee must be members of this group",
      );

    const [pendingSettlement] = await tx`
      SELECT id
      FROM transactions 
      WHERE group_id = ${groupId}
        AND type = 'settlement'
        AND status = 'pending'
        AND payer_id = ${payerId}
        AND payee_id = ${data.payeeId}
      LIMIT 1
      `;

    if (pendingSettlement)
      throw new ApiError(
        400,
        "You already have a pending settlement with this user. Wait for them to confirm it.",
      );

    const [newTx] = await tx`
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
      RETURNING *
      `;

    if (!newTx) throw new ApiError(500, "Error creating new Transaction");

    const ledgerEntry = [
      {
        transaction_id: newTx.id,
        group_id: groupId,
        user_id: payerId,
        amount: amountKobo,
      },
      {
        transaction_id: newTx.id,
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

    return newTx;
  });

  return settlement;
};

// export const listGroupSettlements = async (groupId: string) => {
//   const allSettlements = await db.query.settlements.findMany({
//     where: eq(settlements?.groupId, groupId),
//     orderBy: [desc(settlements.createdAt)],
//     with: {
//       payer: {
//         columns: { id: true, name: true, email: true },
//       },
//       payee: {
//         columns: { id: true, name: true, email: true },
//       },
//     },
//   });

//   return allSettlements;
// };

export const confirmSettlement = async (
  userId: string,
  groupId: string,
  settlementId: string,
) => {
  const confirmedTransaction = await pg.begin(async (tx) => {
    const [transaction] = await tx`
    SELECT id, status, type, payee_id
    FROM transactions
    WHERE id = ${settlementId} 
      AND group_id= ${groupId}
    FOR UPDATE
    `;

    if (!transaction) throw new ApiError(404, "Settlement not found");

    if (transaction.type !== "settlement") {
      throw new ApiError(
        400,
        "This transaction type cannot be confirmed manually",
      );
    }

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
      RETURNING *
    `;

    return updatedTransaction;
  });

  return confirmedTransaction;
};

export const rejectSettlement = async (
  userId: string,
  groupId: string,
  settlementId: string,
) => {
  const [transaction] = await pg`
    SELECT id, status, payee_id, payer_id
    FROM transactions
    WHERE id = ${settlementId} 
      AND group_id= ${groupId}
      AND type = 'settlement'
    FOR UPDATE
    `;

  if (!transaction) throw new ApiError(404, "Pending settlement not found");

  if (transaction.status !== "confirmed")
    throw new ApiError(
      400,
      `You cannot reject a settlement that is already ${transaction.status}`,
    );

  if (transaction.payee_id !== userId && transaction.payer_id !== userId)
    throw new ApiError(
      403,
      "You are not authorised to confirm this settlement",
    );

  const [rejectedSettlement] = await pg`
      DELETE FROM transactions
      WHERE id = ${settlementId}
      RETURNING *
    `;

  return rejectedSettlement;
};

// export const getSettlementDetail = async (
//   userId: string,
//   groupId: string,
//   settlementId: string,
// ) => {
//   const settlement = await db.query.settlements.findFirst({
//     where: and(
//       eq(settlements.groupId, groupId),
//       eq(settlements.id, settlementId),
//       or(eq(settlements.payerId, userId), eq(settlements.payeeId, userId)),
//     ),
//     with: {
//       payer: {
//         columns: { id: true, name: true, email: true },
//       },
//       payee: {
//         columns: { id: true, name: true, email: true },
//       },
//     },
//   });

//   if (!settlement) {
//     throw new ApiError(
//       404,
//       "Settlement not found or you are not authorized to view it",
//     );
//   }

//   return settlement;
// };
