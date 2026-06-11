// import { sql } from "drizzle-orm";
// import {
//   check,
//   index,
//   numeric,
//   pgTable,
//   text,
//   timestamp,
//   uuid,
// } from "drizzle-orm/pg-core";
// import { groups } from "./groups";
// import { user } from "./auth";

// export const expenses = pgTable(
//   "expenses",
//   {
//     id: uuid("id").primaryKey().defaultRandom(),
//     groupId: uuid("group_id")
//       .notNull()
//       .references(() => groups.id, { onDelete: "cascade" }),
//     payerId: text("payer_id")
//       .notNull()
//       .references(() => user.id, { onDelete: "restrict" }),
//     totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
//     splitType: text("split_type", {
//       enum: ["equal", "percentage", "exact"],
//     }).notNull(),
//     category: text("category"),
//     description: text("description"),
//     createdAt: timestamp("created_at", { withTimezone: true })
//       .notNull()
//       .defaultNow(),
//   },
//   (t) => [
//     check("expenses_amount_check", sql`${t.totalAmount} > 0`),
//     index("expenses_group_idx").on(t.groupId),
//     index("expenses_payer_idx").on(t.payerId),
//     index("expenses_group_created_idx").on(t.groupId, t.createdAt),
//   ],
// );
