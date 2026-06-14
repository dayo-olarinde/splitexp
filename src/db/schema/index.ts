import { relations } from "drizzle-orm";
import { user } from "./auth";
import { ledgerEntries } from "./ledgerEntries";
import { transactions } from "./transactions";

export * from "./auth";
export * from "./groupMembers";
export * from "./groups";
export * from "./ledgerEntries";
export * from "./transactions";

// RELATIONS
export const transactionsRelations = relations(
  transactions,
  ({ one, many }) => ({
    payer: one(user, {
      fields: [transactions.payerId],
      references: [user.id],
    }),
    payee: one(user, {
      fields: [transactions.payeeId],
      references: [user.id],
    }),
    shares: many(ledgerEntries),
  }),
);

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(transactions, {
    fields: [ledgerEntries.transactionId],
    references: [transactions.id],
  }),
  participant: one(user, {
    fields: [ledgerEntries.userId],
    references: [user.id],
  }),
}));
