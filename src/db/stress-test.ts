import { pg } from "../config/db";

const BASE_URL = "http://localhost:7000";

// How many identical settlement requests we fire at the exact same instant.
const CONCURRENT_SETTLEMENTS = 5;

const SETTLEMENT_AMOUNT = "1500.00";
const SETTLEMENT_AMOUNT_KOBO = 150000;
const SEED_PASSWORD = "Password123!";

// Leave the confirmed test settlement behind instead of deleting it at the end.
const KEEP_ARTIFACTS = process.env.KEEP_STRESS_ARTIFACTS === "1";

type ApiBody = {
  success: boolean;
  statusCode: number;
  message: string;
  data?: unknown;
};

type StressResponse = {
  id: number;
  status: number;
  body: ApiBody;
};

type CreatedSettlement = {
  id: string;
  status: string;
  total_amount: number;
};

type ApiBalanceRow = {
  user_id: string;
  user_name: string;
  net_balance: number;
};

let assertionsPassed = 0;

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  assertionsPassed++;
  console.log(`  ✅ ${message}`);
};

const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${BASE_URL}${path}`, init);
  return { status: res.status, body: (await res.json()) as ApiBody };
};

const signIn = async (email: string) => {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  });

  const cookie = res.headers.get("set-cookie");
  if (!res.ok || !cookie)
    throw new Error(`Authentication failed for ${email} (HTTP ${res.status})`);

  return cookie;
};

/** Net balance per user, in kobo, counting only confirmed transactions. */
const confirmedBalances = async (groupId: string) => {
  const rows = await pg<{ user_id: string; net_balance: string }[]>`
    SELECT le.user_id, SUM(le.amount) AS net_balance
    FROM ledger_entries le
    JOIN transactions t ON t.id = le.transaction_id
    WHERE le.group_id = ${groupId}
      AND t.status = 'confirmed'
    GROUP BY le.user_id
  `;

  return new Map(rows.map((row) => [row.user_id, Number(row.net_balance)]));
};

/** Sum of every ledger entry, in kobo, for one group and for the whole database. */
const ledgerSums = async (groupId: string) => {
  const [group] = await pg<{ total: string }[]>`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM ledger_entries
    WHERE group_id = ${groupId}
  `;
  const [database] = await pg<{ total: string }[]>`
    SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries
  `;

  return { group: Number(group!.total), database: Number(database!.total) };
};

const sum = (values: Iterable<number>) =>
  [...values].reduce((total, value) => total + value, 0);

const toBalanceMap = (rows: ApiBalanceRow[]) =>
  new Map(rows.map((row) => [row.user_id, Math.round(Number(row.net_balance) * 100)]));

const sameBalances = (a: Map<string, number>, b: Map<string, number>) =>
  a.size === b.size && [...a].every(([userId, kobo]) => b.get(userId) === kobo);

const formatBalances = (balances: Map<string, number>) =>
  [...balances]
    .map(([userId, kobo]) => `${userId.slice(0, 8)}… = ${(kobo / 100).toFixed(2)}`)
    .join(", ") || "(none)";

async function runStressTest() {
  console.log("⚡ Starting Concurrency Stress Test...\n");

  // The guard lives in the database, so refuse to run without it: otherwise
  // every request fails with "no unique or exclusion constraint matching the
  // ON CONFLICT specification" and the test is meaningless.
  const [guardIndex] = await pg<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'transactions' AND indexname = 'uniq_pending_settlement'
  `;
  assert(
    Boolean(guardIndex),
    "the partial unique index uniq_pending_settlement exists (concurrency guard is enforced by the DB)",
  );

  const [group] = await pg<{ id: string; name: string }[]>`
    SELECT id, name FROM groups ORDER BY created_at LIMIT 1
  `;
  if (!group) throw new Error("No groups found. Run seed script first!");

  const members = await pg<{ user_id: string }[]>`
    SELECT user_id FROM group_members
    WHERE group_id = ${group.id}
    ORDER BY user_id
    LIMIT 2
  `;
  if (members.length < 2)
    throw new Error("Not enough members in group to test settlements.");

  const payerId = members[0]!.user_id;
  const payeeId = members[1]!.user_id;

  const users = await pg<{ id: string; name: string; email: string }[]>`
    SELECT id, name, email FROM "user"
    WHERE id IN (${payerId}, ${payeeId})
  `;
  const payer = users.find((user) => user.id === payerId)!;
  const payee = users.find((user) => user.id === payeeId)!;

  const [alreadyPending] = await pg<{ count: number }[]>`
    SELECT count(*)::int AS count FROM transactions
    WHERE group_id = ${group.id}
      AND type = 'settlement' AND status = 'pending'
      AND payer_id = ${payerId} AND payee_id = ${payeeId}
  `;
  if (alreadyPending!.count > 0)
    throw new Error(
      "A pending settlement already exists between the two chosen members — " +
        "confirm or reject it (or re-seed) before running this test.",
    );

  console.log(`🏢 Group:  ${group.name} (${group.id})`);
  console.log(`👤 Payer:  ${payer.name} <${payer.email}>`);
  console.log(`👤 Payee:  ${payee.name} <${payee.email}>\n`);

  const payerCookie = await signIn(payer.email);
  const payeeCookie = await signIn(payee.email);
  console.log("🔓 Sessions established for both parties.\n");

  const balancesBefore = await confirmedBalances(group.id);
  const sumsBefore = await ledgerSums(group.id);

  console.log(`📸 Confirmed balances before: ${formatBalances(balancesBefore)}`);
  assert(
    sumsBefore.group === 0,
    `the group's ledger already sums to zero before the test (${sumsBefore.group} kobo)`,
  );
  assert(
    sumsBefore.database === 0,
    `the whole database's ledger already sums to zero before the test (${sumsBefore.database} kobo)`,
  );
  assert(
    sum(balancesBefore.values()) === 0,
    `confirmed balances already sum to zero before the test (${sum(balancesBefore.values())} kobo)`,
  );

  const settlementPayload = {
    payeeId,
    amount: SETTLEMENT_AMOUNT,
    description: "Concurrent Stress Test Splitting",
  };

  const requests = Array.from({ length: CONCURRENT_SETTLEMENTS }).map(
    (_, index) =>
      api(`/api/v1/groups/${group.id}/settlements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: BASE_URL,
          Cookie: payerCookie,
        },
        body: JSON.stringify(settlementPayload),
      }).then((res) => ({ id: index + 1, ...res }) as StressResponse),
  );

  console.log(
    `🚀 Firing ${CONCURRENT_SETTLEMENTS} identical ₦${SETTLEMENT_AMOUNT} settlement requests at the exact same millisecond...`,
  );

  const responses = await Promise.all(requests);

  console.log("\n📊 --- STRESS TEST RESULTS ---");
  responses.forEach((res) => {
    console.log(`\nRequest #${res.id}: HTTP ${res.status}`);
    console.log(`Response:`, JSON.stringify(res.body));
  });
  console.log("");

  const winners = responses.filter((res) => res.status === 200);
  const rejected = responses.filter((res) => res.status === 409);

  assert(
    responses.every((res) => res.status === 200 || res.status === 409),
    `no request crashed: all ${CONCURRENT_SETTLEMENTS} responses are 200 or 409 (no 5xx)`,
  );
  assert(
    winners.length === 1,
    `exactly 1 of the ${CONCURRENT_SETTLEMENTS} concurrent requests created a settlement (got ${winners.length})`,
  );
  assert(
    rejected.length === CONCURRENT_SETTLEMENTS - 1,
    `the other ${CONCURRENT_SETTLEMENTS - 1} requests were rejected with 409 Conflict`,
  );

  const created = winners[0]!.body.data as CreatedSettlement;
  assert(created?.status === "pending", "the created settlement starts as pending");
  assert(
    created?.total_amount === 1500,
    "the amount round-trips as 1500.00 (not doubled, not lost)",
  );

  const [pendingRows] = await pg<{ count: number }[]>`
    SELECT count(*)::int AS count FROM transactions
    WHERE group_id = ${group.id}
      AND type = 'settlement' AND status = 'pending'
      AND payer_id = ${payerId} AND payee_id = ${payeeId}
  `;
  assert(
    pendingRows!.count === 1,
    `the database holds exactly 1 pending settlement for this pair, not ${CONCURRENT_SETTLEMENTS}`,
  );

  const entries = await pg<{ amount: number }[]>`
    SELECT amount FROM ledger_entries WHERE transaction_id = ${created.id}
  `;
  const entrySum = sum(entries.map((entry) => Number(entry.amount)));

  assert(
    entries.length === 2,
    `the settlement wrote exactly 2 ledger entries (got ${entries.length})`,
  );
  assert(
    entrySum === 0,
    `its ledger entries sum to zero (got ${entrySum} kobo)`,
  );
  assert(
    entries.some((entry) => Number(entry.amount) === SETTLEMENT_AMOUNT_KOBO) &&
      entries.some((entry) => Number(entry.amount) === -SETTLEMENT_AMOUNT_KOBO),
    `the entries are exactly +${SETTLEMENT_AMOUNT_KOBO} (payer) and -${SETTLEMENT_AMOUNT_KOBO} (payee) kobo`,
  );

  const sumsAfterBurst = await ledgerSums(group.id);
  assert(
    sumsAfterBurst.group === 0,
    `the group's entire ledger still sums to zero (${sumsAfterBurst.group} kobo)`,
  );
  assert(
    sumsAfterBurst.database === 0,
    `the database's entire ledger still sums to zero (${sumsAfterBurst.database} kobo)`,
  );

  const balancesWhilePending = await confirmedBalances(group.id);
  assert(
    sameBalances(balancesWhilePending, balancesBefore),
    "pending entries are excluded: every confirmed balance is unchanged",
  );
  assert(
    sum(balancesWhilePending.values()) === 0,
    "confirmed balances still sum to zero while the settlement is pending",
  );

  const apiPending = await api(`/api/v1/groups/${group.id}/balances`, {
    headers: { Cookie: payerCookie },
  });
  assert(apiPending.status === 200, "GET /balances answers 200 for a group member");
  const apiPendingBalances = toBalanceMap(apiPending.body.data as ApiBalanceRow[]);
  assert(
    sameBalances(apiPendingBalances, balancesWhilePending),
    "the balances endpoint agrees with the ledger, to the kobo",
  );
  assert(
    sum(apiPendingBalances.values()) === 0,
    "the endpoint's balances net to zero",
  );

  const confirmation = await api(
    `/api/v1/groups/${group.id}/settlements/${created.id}/confirm`,
    { method: "PATCH", headers: { Origin: BASE_URL, Cookie: payeeCookie } },
  );
  assert(confirmation.status === 200, "the payee confirms the settlement (200)");

  const balancesAfter = await confirmedBalances(group.id);
  const expected = new Map(balancesBefore);
  expected.set(payerId, (balancesBefore.get(payerId) ?? 0) + SETTLEMENT_AMOUNT_KOBO);
  expected.set(payeeId, (balancesBefore.get(payeeId) ?? 0) - SETTLEMENT_AMOUNT_KOBO);

  assert(
    sameBalances(balancesAfter, expected),
    `the payer is +${SETTLEMENT_AMOUNT_KOBO} kobo and the payee is -${SETTLEMENT_AMOUNT_KOBO} kobo, every other member untouched`,
  );
  assert(
    sum(balancesAfter.values()) === 0,
    "balances still net to zero after confirmation",
  );

  const sumsAfterConfirm = await ledgerSums(group.id);
  assert(
    sumsAfterConfirm.group === 0 && sumsAfterConfirm.database === 0,
    "both ledgers still sum to zero after confirmation",
  );

  const apiAfter = await api(`/api/v1/groups/${group.id}/balances`, {
    headers: { Cookie: payerCookie },
  });
  assert(
    sameBalances(toBalanceMap(apiAfter.body.data as ApiBalanceRow[]), balancesAfter),
    "the balances endpoint matches the ledger after confirmation",
  );

  if (KEEP_ARTIFACTS) {
    console.log(
      `\n🧹 KEEP_STRESS_ARTIFACTS=1 — leaving settlement ${created.id} in place.`,
    );
  } else {
    await pg`DELETE FROM transactions WHERE id = ${created.id}`; // ledger_entries cascade

    const balancesRestored = await confirmedBalances(group.id);
    const sumsRestored = await ledgerSums(group.id);

    assert(
      sameBalances(balancesRestored, balancesBefore),
      "after deleting the test settlement every balance is back to the pre-test snapshot",
    );
    assert(
      sumsRestored.group === 0 && sumsRestored.database === 0,
      "the ledgers still sum to zero after cleanup",
    );
    console.log(
      `\n🧹 Deleted test settlement ${created.id} — the database is back where it started.`,
    );
  }

  console.log(
    `\n🎉 ALL ${assertionsPassed} ASSERTIONS PASSED — no lost updates, no double settlement, ledger balanced.`,
  );
  process.exit(0);
}

runStressTest().catch((err) => {
  console.error(
    "\n❌ Stress test failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
