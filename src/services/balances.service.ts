import { pg } from "../config/db";
import { toDecimal } from "../utils/calculations";

type GroupBalanceRow = {
  user_id: string;
  user_name: string;
  net_balance: string | number;
};

const fetchNetBalances = async (groupId: string) => {
  return pg<GroupBalanceRow[]>`
    SELECT
      le.user_id,
      u.name AS user_name,
      SUM(le.amount) AS net_balance
    FROM ledger_entries le
    JOIN "user" u ON u.id = le.user_id
    JOIN transactions t ON t.id = le.transaction_id
    WHERE le.group_id = ${groupId}
      AND t.status = 'confirmed'
    GROUP BY le.user_id, u.name
  `;
};

export const groupTotalBalances = async (groupId: string) => {
  const balances = await fetchNetBalances(groupId);
  return balances.map((b) => ({
    ...b,
    net_balance: toDecimal(Number(b.net_balance)),
  }));
};

export const simplifiedBalances = async (groupId: string) => {
  const balances = await fetchNetBalances(groupId);

  const normalized = balances.map((b) => ({
    ...b,
    net_balance: Number(b.net_balance),
  }));

  const debtors = normalized
    .filter((b) => b.net_balance < 0)
    .sort((a, b) => a.net_balance - b.net_balance);

  const creditors = normalized
    .filter((b) => b.net_balance > 0)
    .sort((a, b) => b.net_balance - a.net_balance);

  const suggestedSettlements = [];

  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const currentDebtor = debtors[debtorIndex]!;
    const currentCreditor = creditors[creditorIndex]!;

    const debtorOwes = Math.abs(currentDebtor.net_balance);
    const creditorIsOwed = currentCreditor.net_balance;

    const settlementAmount = Math.min(debtorOwes, creditorIsOwed);

    suggestedSettlements.push({
      from: {
        id: currentDebtor.user_id,
        name: currentDebtor.user_name,
      },
      to: {
        id: currentCreditor.user_id,
        name: currentCreditor.user_name,
      },
      amount: toDecimal(settlementAmount),
    });

    currentDebtor.net_balance = currentDebtor.net_balance + settlementAmount;
    currentCreditor.net_balance =
      currentCreditor.net_balance - settlementAmount;

    if (currentDebtor.net_balance === 0) {
      debtorIndex++;
    }
    if (currentCreditor.net_balance === 0) {
      creditorIndex++;
    }
  }

  return suggestedSettlements;
};

export const userBalancesInGroup = async (groupId: string, userId: string) => {
  const allGroupSettlements = await simplifiedBalances(groupId);

  const whatIOwe = allGroupSettlements.filter(
    (settlement) => settlement.from.id === userId,
  );

  const owedToMe = allGroupSettlements.filter(
    (settlement) => settlement.to.id === userId,
  );

  return {
    whatIOwe,
    owedToMe,
  };
};
