import { relations } from "drizzle-orm";
import { user } from "./auth";
import { expenses } from "./expenses";
import { expenseShares } from "./expenseShares";

export * from "./auth";
export * from "./expenses";
export * from "./expenseShares";
export * from "./groupMembers";
export * from "./groups";
export * from "./settlements";

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  payer: one(user, {
    fields: [expenses.payerId],
    references: [user.id],
  }),
  shares: many(expenseShares),
}));

export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
  expense: one(expenses, {
    fields: [expenseShares.expenseId],
    references: [expenses.id],
  }),
  participant: one(user, {
    fields: [expenseShares.userId],
    references: [user.id],
  }),
}));
