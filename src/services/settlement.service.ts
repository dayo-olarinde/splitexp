import { pg } from "../config/db";
import { ApiError } from "../utils/api-response";
import { toCents, toDecimal } from "../utils/expenseCalc";
import type { CreateSettlementInput } from "../validations/settlement.validation";

export const logSettlement = async (
  groupId: string,
  payerId: string,
  data: CreateSettlementInput,
) => {
  if (payerId === data.payeeId)
    throw new ApiError(400, "You cannot settle a debt with yourself");

  const amountCents = toCents(data.amount);

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
      FROM settlements
      WHERE group_id = ${groupId} 
        AND payee_id = ${data.payeeId} 
        AND payer_id = ${payerId}
      `;

    if (pendingSettlement)
      throw new ApiError(
        400,
        "You already have a pending settlement with this user. Wait for them to confirm it.",
      );

    const [balance] = await tx`
        WITH debt AS (
            SELECT COALESCE(SUM(es.share_amount), 0) AS amount
            FROM expense_shares es
            JOIN expenses e
                ON e.id = es.expense_id
            WHERE e.group_id = ${groupId}
                AND e.payer_id = ${data.payeeId}
                AND es.user_id = ${payerId}
        ), 
        settlement AS (
            SELECT COALESCE(SUM(amount), 0) AS amount
            FROM settlements
            WHERE group_id = ${groupId}
                    AND payer_id = ${payerId}
                AND payee_id = ${data.payeeId}
                AND status = 'confirmed'
        )

        SELECT (d.amount -s.amount) as net_owed
        FROM debt d, settlement s
      `;

    const netOwed = toCents(balance?.net_owed);

    if (Number(netOwed) <= 0)
      throw new ApiError(400, "You do not owe this user any money.");

    if (amountCents > netOwed)
      throw new ApiError(
        400,
        `You cannot overpay. You only owe ${toDecimal(netOwed)}.`,
      );

    const [newSettlement] = await tx`
      INSERT INTO settlements (group_id, payer_id, payee_id, amount, status)
      VALUES (${groupId}, ${payerId}, ${data.payeeId}, ${data.amount}, 'pending')
      RETURNING *
      `;

    return newSettlement;
  });

  return settlement;
};
