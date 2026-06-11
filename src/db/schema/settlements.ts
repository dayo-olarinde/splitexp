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

// export const settlements = pgTable(
//   "settlements",
//   {
//     id: uuid("id").primaryKey().defaultRandom(),
//     groupId: uuid("group_id")
//       .notNull()
//       .references(() => groups.id, { onDelete: "cascade" }),
//     payerId: text("payer_id")
//       .notNull()
//       .references(() => user.id, { onDelete: "restrict" }),
//     payeeId: text("payee_id")
//       .notNull()
//       .references(() => user.id, { onDelete: "restrict" }),
//     amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
//     status: text("status", { enum: ["pending", "confirmed"] })
//       .notNull()
//       .default("pending"),
//     createdAt: timestamp("created_at", { withTimezone: true })
//       .notNull()
//       .defaultNow(),
//     updatedAt: timestamp("updated_at", { withTimezone: true })
//       .notNull()
//       .defaultNow(),
//   },
//   (t) => [
//     check("settlements_amount_check", sql`${t.amount} > 0`),
//     check("settlements_no_self_pay", sql`${t.payerId} != ${t.payeeId}`),
//     index("settlements_group_idx").on(t.groupId),
//     index("settlements_payer_idx").on(t.payerId),
//     index("settlements_payee_idx").on(t.payeeId),
//   ],
// );
