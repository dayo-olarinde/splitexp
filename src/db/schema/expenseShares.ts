import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { expenses } from "./expenses";
import { user } from "./auth";

export const expenseShares = pgTable(
  "expense_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    shareAmount: numeric("share_amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("expense_shares_amount_check", sql`${t.shareAmount} > 0`),
    uniqueIndex("expense_shares_expense_user_idx").on(t.expenseId, t.userId),
    index("expense_shares_user_idx").on(t.userId),
  ],
);
