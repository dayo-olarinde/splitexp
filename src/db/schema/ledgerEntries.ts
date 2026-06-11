import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { groups } from "./groups";
import { transactions } from "./transactions";

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionId: uuid("transaction_id")
    .references(() => transactions.id, { onDelete: "cascade" })
    .notNull(),

  groupId: uuid("group_id")
    .references(() => groups.id)
    .notNull(),

  userId: text("user_id")
    .references(() => user.id)
    .notNull(),

  currency: text("currency").default("NGN"),
  amount: integer("amount").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
