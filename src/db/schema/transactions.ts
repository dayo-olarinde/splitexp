import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { groups } from "./groups";

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .references(() => groups.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type", { enum: ["expense", "settlement"] }).notNull(),
    status: text("status", { enum: ["pending", "confirmed"] })
      .default("confirmed")
      .notNull(),
    splitType: text("split_type", { enum: ["equal", "percentage", "exact"] }),
    description: text("description").notNull(),
    category: text("category"),
    totalAmount: integer("total_amount"),
    payerId: text("payer_id").references(() => user.id),
    payeeId: text("payee_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("transaction_group_idx").on(t.groupId, t.type)],
);
