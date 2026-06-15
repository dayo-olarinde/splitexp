import { pg } from "../config/db";

const BASE_URL = "http://localhost:7000";

async function runStressTest() {
  console.log("⚡ Starting Concurrency Stress Test...");

  // 1. Grab a dynamic Group and 2 Members straight from the DB so you don't have to copy-paste IDs
  const [group] = await pg`SELECT id FROM groups LIMIT 1`;
  if (!group) throw new Error("No groups found. Run seed script first!");

  const members =
    await pg`SELECT user_id FROM group_members WHERE group_id = ${group.id} LIMIT 2`;
  if (members.length < 2)
    throw new Error("Not enough members in group to test settlements.");

  const debtorId = members[0]!.user_id;
  const creditorId = members[1]!.user_id;

  // Find the debtor's email to log them in
  const [debtorUser] =
    await pg`SELECT email FROM "user" WHERE id = ${debtorId}`;

  console.log(`👤 Logging in as Debtor: ${debtorUser!.email}`);

  // 2. Authenticate with Better-Auth to grab a valid session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({
      email: debtorUser!.email,
      password: "Password123!",
    }),
  });

  const cookie = loginRes.headers.get("set-cookie");
  if (!cookie)
    throw new Error("Authentication failed, could not extract session cookie.");

  console.log("🔓 Session established. Preparing simultaneous assault...");

  // 3. Construct the payload data
  const settlementPayload = {
    payeeId: creditorId,
    amount: "1500.00",
    description: "Concurrent Stress Test Splitting",
  };

  // 4. Wrap 5 identical fetch requests into an array of Promises
  const requests = Array.from({ length: 5 }).map((_, index) => {
    return fetch(`${BASE_URL}/api/v1/groups/${group.id}/settlements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: BASE_URL,
        Cookie: cookie, // Pass the session authentication along
      },
      body: JSON.stringify(settlementPayload),
    }).then(async (res) => ({
      id: index + 1,
      status: res.status,
      body: await res.json(),
    }));
  });

  console.log(
    "🚀 Firing 5 concurrent settlement requests at the exact same millisecond...",
  );

  // 5. Fire them all simultaneously!
  const responses = await Promise.all(requests);

  console.log("\n📊 --- STRESS TEST RESULTS ---");
  responses.forEach((res) => {
    console.log(`\nRequest #${res.id}: HTTP Status ${res.status}`);
    console.log(`Response:`, JSON.stringify(res.body));
  });

  process.exit(0);
}

runStressTest().catch((err) => {
  console.error("❌ Stress test crashed:", err);
  process.exit(1);
});
