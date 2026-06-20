**SplitEx**  
A backend-only expense-splitting API. Built specifically to go deep on raw SQL, transactional correctness, and concurrency control rather than leaning on an ORM to hide them.  
No frontend by design. This is a portfolio piece about the data layer, not the UI.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OUQmAABBAsSeYxZyXSzCJASxgACv4J8KWYMvMbNURAAB/ca7VXe1fTwAAeO16AKe+BdmJqrPdAAAAAElFTkSuQmCC)  
**Stack**  
Node.js · Express · TypeScript · PostgreSQL via [postgres (raw SQL, no query builder for writes) · Drizzle ORM (schema definition + migrations only) · Better-Auth · Redis · express-rate-limit + rate-limit-redis](https://github.com/porsager/postgres "https://github.com/porsager/postgres")  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSPBCUbfEm6YmFDBhAU2QtIq6DIzW7UHAMBfnGt1V8fXEwAAXrse/w8F7pbTa1oAAAAASUVORK5CYII=)  
**Why raw SQL instead of an ORM**  
Drizzle is in the stack, but only for schema definition, migration generation, and a handful of read queries with relational joins (db.query.transactions.findMany({ with: ... })). Every write that touches money: logging an expense, settling a debt, confirming a settlement, is hand-written SQL through postgres.js tagged templates, inside explicit transactions. The point of the project was to actually reason about query plans, isolation, and locking myself instead of trusting an abstraction to get it right, see the db:explain and db:stress scripts below, which exist specifically to verify that reasoning rather than assume it.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAM0lEQVR4nO3OMQ0AIAwAwZKQ6kBqjSAOJywYYCIkd9OP36pqRMQMAAB+sfqJfLoBAMCN3NYoAzBA+QG0AAAAAElFTkSuQmCC)  
**The Data Model**  
Money doesn't live in a single mutable balance column anywhere in this system. Every expense and every settlement is a **transaction**, and every transaction writes a set of  **ledger entries**: one row per participant, signed positive or negative, that always sum to zero.  
- **Money is stored as integers (kobo), never floats.**toKobo() / toDecimal() convert at the edges; everything in between is integer arithmetic, so there's no floating-point drift across thousands of split calculations.  
- **A "balance" is never stored, it's always derived**: SUM(ledger_entries.amount) per user, filtered to confirmed transactions. The audit trail (every transaction that contributed to that number) is always reconstructable; a stored balance that's just an incrementing counter would lose that.  
- **Settlements are two-step, not instant.** Recording a settlement creates a pending transaction; the payee has to explicitly confirm it before it affects anyone's balance calculation. This models reality: "I paid you back" isn't true until the other person agrees it happened.  
- The schema went through a real redesign mid-build: earlier expenses, expense_shares, and settlements tables (still visible, commented out, in src/db/schema/) were collapsed into the unified transactions + ledger_entries double-entry model once it became clear that was the cleaner way to represent "money moved between people," rather than three separate shapes for the same underlying idea.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsSfYxZo/jkUsYQLPJrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA4rDBc72meO5AAAAAElFTkSuQmCC)  
**Concurrency & Correctness**  
This is the part of the project most worth asking about:  
- **Splitting a bill that doesn't divide evenly** (e.g. ₦1,000 split 3 ways) is handled by computing the floor share per person in kobo, then assigning the leftover remainder kobo to a single participant, so shares always sum to exactly the original total, never off by a kobo from rounding.  
- **Exact and percentage splits are validated server-side before any row is written**: exact splits must sum to the total, percentages must sum to 100 (within floating-point tolerance), both checked in integer kobo terms.  
- **SELECT ... FOR UPDATE** ** row locking on settlements**: confirming or rejecting a settlement locks that transaction row first, so two concurrent confirm requests for the same settlement can't both succeed. Creating a settlement locks the relevant group_members rows and checks for an existing pending settlement between the same two people before inserting, preventing duplicate-settlement races.  
- **A ledger-balance assertion runs inside every settlement transaction**: after writing both ledger entries, the code sums them and aborts the whole transaction if they don't net to zero. A real safety net, not just a comment promising the entries are paired correctly.  
- **scripts/stress-test.ts** ** fires 5 identical settlement requests at the same group concurrently** against a running server to verify the locking actually holds under real concurrent load, not just in theory.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OYQ1AABSAwY9JoICqL4Z8Ikiggn9mu0twy8wc1RkAAH9xbdVa7V9PAAB47X4A9CgEJQFjJ/EAAAAASUVORK5CYII=)  
**Performance**  
- **scripts/explain.ts** runs EXPLAIN (ANALYZE, BUFFERS) against the actual monthly-spend analytics query (a window-function running total over grouped transactions) with sequential scans deliberately disabled, to inspect and verify index usage on a real query plan rather than guessing.  
- Indexes are deliberately placed on the columns the actual query patterns hit: (group_id, type) on transactions, (group_id, user_id) uniqueness on group membership, user_id lookups on ledger entries, chosen by looking at what the services actually query, not added speculatively.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OQQmAABRAsSd4NIGRTPXNaQBrWMGbCFuCLTOzV2cAAPzFvVZbdXw9AQDgtesBhZQEOYZGgUEAAAAASUVORK5CYII=)  
**API Surface**  
Mounted under /api/v1, auth under /api/auth (Better-Auth). Rate limiting is tiered: a global limiter (150 req/15 min) on everything, and a much tighter limiter (15 req/min, keyed by user ID) specifically on financial-transaction endpoints, distributed via Redis so it holds correctly across multiple server instances.  
| | |  
|-|-|  
| **Resource** | **What it covers** |   
| /groups | Create/manage groups and membership (admin/member roles) |   
| /groups/:groupId/expenses | Log, list, view, delete expenses: equal/exact/percentage splits |   
| /groups/:groupId/settlements | Propose, confirm, reject debt settlements |   
| /groups/:groupId/balances | Net balances per member, plus simplified "who owes whom" suggestions |   
| /groups/:groupId/analytics | Spend by category, by member, monthly breakdown |   
   
**Debt simplification**  
GET .../balances doesn't just return raw pairwise balances, it runs a greedy settlement-minimizing algorithm: sort members into debtors and creditors by net balance, repeatedly match the largest debtor against the largest creditor for the smaller of the two amounts, and advance whichever side hits zero. This collapses a group's tangled web of who-owes-who into the minimum number of actual payments needed to settle everyone up.  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANUlEQVR4nO3OMQ2AABAAsSNBCUrfDqrYGVDAgAU2QtIq6DIzW7UHAMBfHGt1V+fXEwAAXrseHCQGBEuErVgAAAAASUVORK5CYII=)  
**Local Setup**  
bun install  
 # create a .env file with the variables below  
 bun run db:migrate  
 bun run db:seed      # optional: populates sample groups/users/expenses  
 bun run dev           # http://localhost:8000 by default  
   
**Environment variables:**  
| | |  
|-|-|  
| **Variable** | **Purpose** |   
| DATABASE_URL | Postgres connection string |   
| FRONTEND_URL | CORS origin |   
| BETTER_AUTH_SECRET | Better-Auth signing secret (32+ chars) |   
| BETTER_AUTH_URL | Base URL Better-Auth issues sessions against |   
| REDIS_URL / REDIS_HOST / REDIS_PORT | Rate limiting + cache |   
   
**Verification scripts:**  
npm run db:explain   # EXPLAIN ANALYZE on the analytics query, index usage check  
 npm run db:stress    # fires concurrent settlement requests against a running server  
   
*db:stress* * targets * *localhost:7000* *, set * *PORT=7000* * in * *.env* * before running * *npm run dev* * if you want to use it as-is, or point the script at your actual port.*  
![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAnEAAAACCAYAAAA3pIp+AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAANklEQVR4nO3OQQmAABRAsScYxpg/h5VMYARvRrCCNxG2BFtmZquOAAD4i3Ot7mr/egIAwGvXA224BcUMk6pDAAAAAElFTkSuQmCC)  
**License**  
MIT  
