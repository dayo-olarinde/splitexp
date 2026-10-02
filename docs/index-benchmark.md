# Composite index benchmark: `transaction_group_idx`

Evidence for indexing `transactions (group_id, type)` — the composite index the
analytics query depends on. Measured on the dev database with
`EXPLAIN (ANALYZE, BUFFERS)`.

## Environment

| | |
|---|---|
| Postgres | 15.15 (docker container `splitexp_postgres`, database `splitexp_dev`) |
| `transactions` | 500,003 rows, 62 MB |
| `transaction_group_idx` | `btree (group_id, type)`, 3,608 kB |
| Group under test | `00bef271-cef4-48ea-8574-96befaa1ffd5`, 500 expense rows (0.1% of the table) |
| Index dropped | `DROP INDEX transaction_group_idx;` |
| Index restored | `CREATE INDEX "transaction_group_idx" ON "transactions" USING btree ("group_id","type");` |

Method: `ANALYZE transactions` before each state, one warm-up run discarded and
two measured runs per state, planner left at its defaults (`enable_seqscan` is
not forced, unlike `src/db/explain.ts`).

## Query

The monthly-spend analytics query used by `db:explain`:

```sql
WITH monthly_spend AS (
  SELECT DATE_TRUNC('month', created_at) AS month,
         COALESCE(SUM(total_amount), 0)::int AS monthly_total
  FROM transactions
  WHERE group_id = '00bef271-cef4-48ea-8574-96befaa1ffd5'::uuid
    AND type = 'expense'
  GROUP BY month
)
SELECT month, monthly_total,
       SUM(monthly_total) OVER (ORDER BY month ASC) AS running_total
FROM monthly_spend
ORDER BY month ASC;
```

## Before — index present

```
 WindowAgg  (cost=808.35..814.22 rows=335 width=20) (actual time=0.512..0.534 rows=24 loops=1)
   Buffers: shared hit=12
   ->  Sort  (cost=808.35..809.19 rows=335 width=12) (actual time=0.501..0.503 rows=24 loops=1)
         Sort Key: (date_trunc('month'::text, transactions.created_at))
         Sort Method: quicksort  Memory: 26kB
         Buffers: shared hit=12
         ->  HashAggregate  (cost=785.93..790.96 rows=335 width=12) (actual time=0.472..0.480 rows=24 loops=1)
               Group Key: date_trunc('month'::text, transactions.created_at)
               Batches: 1  Memory Usage: 37kB
               Buffers: shared hit=12
               ->  Index Scan using transaction_group_idx on transactions  (cost=0.42..783.69 rows=448 width=12) (actual time=0.039..0.348 rows=500 loops=1)
                     Index Cond: ((group_id = '00bef271-cef4-48ea-8574-96befaa1ffd5'::uuid) AND (type = 'expense'::text))
                     Buffers: shared hit=12
 Planning Time: 0.138 ms
 Execution Time: 0.667 ms
```

## After — index dropped

```
 WindowAgg  (cost=12111.57..12173.75 rows=335 width=20) (actual time=56.343..67.806 rows=24 loops=1)
   Buffers: shared hit=8053
   ->  Finalize GroupAggregate  (cost=12111.57..12165.37 rows=335 width=12) (actual time=56.208..67.655 rows=24 loops=1)
         Group Key: (date_trunc('month'::text, transactions.created_at))
         Buffers: shared hit=8053
         ->  Gather Merge  (cost=12111.57..12158.48 rows=374 width=16) (actual time=56.186..67.587 rows=24 loops=1)
               Workers Planned: 2
               Workers Launched: 2
               Buffers: shared hit=8053
               ->  Partial GroupAggregate  (cost=11111.54..11115.28 rows=187 width=16) (actual time=44.372..44.460 rows=8 loops=3)
                     Group Key: (date_trunc('month'::text, transactions.created_at))
                     Buffers: shared hit=8053
                     ->  Sort  (cost=11111.54..11112.01 rows=187 width=12) (actual time=44.361..44.401 rows=167 loops=3)
                           Sort Key: (date_trunc('month'::text, transactions.created_at))
                           Sort Method: quicksort  Memory: 52kB
                           Buffers: shared hit=8053
                           Worker 0:  Sort Method: quicksort  Memory: 25kB
                           Worker 1:  Sort Method: quicksort  Memory: 25kB
                           ->  Parallel Seq Scan on transactions  (cost=0.00..11104.49 rows=187 width=12) (actual time=25.353..43.706 rows=167 loops=3)
                                 Filter: ((group_id = '00bef271-cef4-48ea-8574-96befaa1ffd5'::uuid) AND (type = 'expense'::text))
                                 Rows Removed by Filter: 166501
                                 Buffers: shared hit=7979
 Planning Time: 0.454 ms
 Execution Time: 67.992 ms
```

## After re-adding the index

The planner returns to the index scan; the recreated index definition is
byte-identical to the original.

```
               ->  Index Scan using transaction_group_idx on transactions  (cost=0.42..778.37 rows=445 width=12) (actual time=0.039..0.340 rows=500 loops=1)
                     Index Cond: ((group_id = '00bef271-cef4-48ea-8574-96befaa1ffd5'::uuid) AND (type = 'expense'::text))
                     Buffers: shared hit=12
 Planning Time: 0.155 ms
 Execution Time: 0.675 ms
```

## Timings

| State | Plan | Execution time (run 1 / run 2) | Shared buffers |
|---|---|---|---|
| Index present | `Index Scan using transaction_group_idx` | 0.667 ms / 0.653 ms | 12 pages |
| Index dropped | `Parallel Seq Scan` (2 workers) | 67.992 ms / 49.895 ms | 8,053 pages |
| Index re-added | `Index Scan using transaction_group_idx` | 0.693 ms / 0.675 ms | 12 pages (9 hit, 3 read) |

**Result:** the index scans 12 pages and finishes in ~0.7 ms; without it the
query scans 8,053 pages to discard 499,503 of 500,003 rows, costing 50–68 ms —
roughly **two orders of magnitude** slower for a single group's monthly spend.
Dropping the index did not change the query result in any state (24 rows).
