import { pg } from "../config/db";
import { toDecimal } from "../utils/calculations";

export const groupAnalyticsSummary = async (groupId: string) => {
  const [totalSpending, categorySpending, memberSpending] = await Promise.all([
    pg<{ total: number }[]>`
      SELECT 
        COALESCE(SUM(total_amount), 0)::int AS total
      FROM transactions
      WHERE group_id = ${groupId}
        AND type = 'expense'
      `,

    pg`
      SELECT
        COALESCE(category, 'uncategorised') AS category,
        COALESCE(SUM(total_amount), 0)::int AS amount
      FROM transactions
      WHERE group_id = ${groupId}
        AND type = 'expense'
      GROUP BY category
      ORDER BY amount DESC
      `,

    pg`
      SELECT
        le.user_id,
        u.name AS user_name,
        ABS(SUM(le.amount))::int AS total_spent
      FROM ledger_entries le
      JOIN transactions t 
        ON t.id = le.transaction_id
      JOIN "user" u
        ON u.id = le.user_id
      WHERE le.group_id = ${groupId}
        AND t.type = 'expense'
        AND le.amount < 0
      GROUP BY le.user_id, u.name
      ORDER BY total_spent DESC
      `,
  ]);

  const totalSpentInKobo = totalSpending[0]?.total ?? 0;

  const byCategory = categorySpending.map((c) => {
    const percentage =
      totalSpentInKobo > 0
        ? Math.round((Number(c.amount) / totalSpentInKobo) * 100)
        : 0;

    return {
      category: c.category,
      amountSpent: toDecimal(c.amount),
      summary: `${c.category} accounts for ${percentage}% of group spending.`,
    };
  });

  const byMember = memberSpending.map((m) => {
    const percentage =
      totalSpentInKobo > 0
        ? Math.round((Number(m.total_spent) / totalSpentInKobo) * 100)
        : 0;
    return {
      memberId: m.user_id,
      name: m.user_name,
      amountSpent: toDecimal(m.total_spent),
      summary: `${m.user_name} consumed ${percentage}% of the total group volume.`,
    };
  });

  return {
    totalSpent: toDecimal(totalSpentInKobo),
    byCategory,
    byMember,
  };
};

export const groupMonthlyBreakdown = async (groupId: string) => {
  const breakdown = await pg`
  WITH monthly_spend AS (
    SELECT 
      DATE_TRUNC('month', created_at) AS month,
      COALESCE(SUM(total_amount), 0)::int AS monthly_total
    FROM transactions 
    WHERE group_id = ${groupId}
      AND type = 'expense'
    GROUP BY month
  ) 

    SELECT 
      month,
      monthly_total,
      SUM(monthly_total) 
        OVER (ORDER BY month ASC) AS running_total
    FROM monthly_spend 
    ORDER BY month ASC
  `;

  const result = breakdown.map((b) => {
    const dateObj = new Date(b.month);

    return {
      month: dateObj.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      monthlySpend: toDecimal(b.monthly_total),
      runningTotal: toDecimal(b.running_total),
    };
  });

  return result;
};

export const topSpenders = async (groupId: string) => {
  const topThreeSpenders = await pg`
    SELECT 
      u.id AS user_id,
      u.name AS user_name,
      COALESCE(SUM(t.total_amount), 0)::int AS funded
    FROM transactions t
    JOIN "user" u
      ON u.id = t.payer_id
    WHERE t.group_id = ${groupId}
      AND t.type = 'expense'
    GROUP BY u.id, u.name
    ORDER BY funded DESC
    LIMIT 3
    `;

  const result = topThreeSpenders.map((s) => ({
    userId: s.user_id,
    userName: s.user_name,
    totalAmountFunded: toDecimal(s.funded),
  }));

  return result;
};

export const myAnalytics = async (userId: string) => {
  const [totalAcrossGroups, groupSpendings, categorySpendings] =
    await Promise.all([
      pg<{ total: number }[]>`
      SELECT
        ABS(SUM(le.amount))::int AS total
      FROM ledger_entries le
      JOIN transactions t
        ON t.id = le.transaction_id
      WHERE t.type = 'expense'
        AND le.user_id = ${userId}
        AND le.amount < 0
    `,

      pg`
      SELECT
        g.id AS group_id,
        g.name AS group_name,
        ABS(SUM(le.amount))::int AS total
      FROM ledger_entries le
      JOIN transactions t
        ON t.id = le.transaction_id
      JOIN groups g
        ON g.id = t.group_id
      WHERE t.type = 'expense'
        AND le.user_id = ${userId}
        AND le.amount < 0
      GROUP BY g.id, g.name
      ORDER BY total DESC
      `,

      pg`
      SELECT
        COALESCE(t.category, 'Uncategorised') AS category,
        ABS(SUM(le.amount))::int AS total
      FROM ledger_entries le
      JOIN transactions t
        ON t.id = le.transaction_id
      WHERE t.type = 'expense'
        AND le.user_id = ${userId}
        AND le.amount < 0
      GROUP BY t.category
      ORDER BY total DESC
      `,
    ]);

  const totalInKobo = totalAcrossGroups[0]?.total ?? 0;
  const totalAcrossAllGroups = toDecimal(totalInKobo);
  const groupAnalytics = groupSpendings.map((g) => ({
    groupId: g.group_id,
    groupName: g.group_name,
    totalSpent: toDecimal(g.total),
    percentage:
      totalInKobo > 0 ? Math.round((Number(g.total) / totalInKobo) * 100) : 0,
  }));
  const categoryAnalytics = categorySpendings.map((c) => ({
    category: c.category,
    totalSpent: toDecimal(c.total),
    percentage:
      totalInKobo > 0 ? Math.round((Number(c.total) / totalInKobo) * 100) : 0,
  }));

  return { totalAcrossAllGroups, groupAnalytics, categoryAnalytics };
};

export const personalMonthlyBreakdown = async (userId: string) => {
  const monthlyBreakdown = await pg`
    WITH monthly_trend as (
      SELECT 
        DATE_TRUNC('month', t.created_at) AS month,
        ABS(SUM(le.amount)):int AS total_spent
      FROM ledger_entries le
      JOIN transactions t
        ON t.id = le.transaction_id
      WHERE le.user_id = ${userId}
        AND t.type = 'expense'
        AND le.amount < 0
      GROUP BY month
)

    SELECT
      month,
      total_spent,
      SUM(total_spent) 
        OVER ( ORDER BY month ASC ) as running_total
    FROM monthly_trend
    ORDER BY month ASC
  `;

  const result = monthlyBreakdown.map((b) => {
    const dateObj = new Date(b.month);

    return {
      month: dateObj.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      monthlySpend: toDecimal(b.total_spent),
      runningTotal: toDecimal(b.running_total),
    };
  });

  return result;
};
