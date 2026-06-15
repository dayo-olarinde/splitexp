import { pg } from "../config/db";

async function runExplainHunt() {
  console.log("🔍 Extracting Query Execution Plan...");

  const [group] = await pg`SELECT id FROM groups LIMIT 1`;
  if (!group) throw new Error("No groups found. Run seed script first!");

  // 1. Tell Postgres to recalculate its internal table row metrics
  await pg`ANALYZE transactions`;

  // 2. Disable sequential scans for this connection session to force index usage
  await pg`SET enable_seqscan = off`;

  const planRows = await pg`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    WITH monthly_spend AS (
      SELECT 
        DATE_TRUNC('month', created_at) AS month,
        COALESCE(SUM(total_amount), 0)::int AS monthly_total
      FROM transactions 
      WHERE group_id = ${group.id}
        AND type = 'expense'
      GROUP BY month
    ) 

    SELECT 
      month,
      monthly_total,
      SUM(monthly_total) 
        OVER (ORDER BY month ASC) AS running_total
    FROM monthly_spend 
    ORDER BY month ASC;
  `;

  console.log("\n🗺️ --- POSTGRESQL EXECUTION PLAN (FORCED INDEX) ---");
  planRows.forEach((row: any) => {
    console.log(row["QUERY PLAN"]);
  });

  // 3. Reset the configuration flag back to default behavior
  await pg`SET enable_seqscan = on`;

  process.exit(0);
}

runExplainHunt().catch((err) => {
  console.error("❌ Explain script crashed:", err);
  process.exit(1);
});
