import { relations } from "drizzle-orm";
import { user } from "./auth";
import { ledgerEntries } from "./ledgerEntries";
import { transactions } from "./transactions";

export * from "./auth";
export * from "./groups";
export * from "./groupMembers";
export * from "./transactions";
export * from "./ledgerEntries";

// RELATIONS
export const transactionsRelations = relations(transactions, ({ many }) => ({
  entries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  transaction: one(transactions, {
    fields: [ledgerEntries.transactionId],
    references: [transactions.id],
  }),
  user: one(user, {
    fields: [ledgerEntries.userId],
    references: [user.id],
  }),
}));

// export const expensesRelations = relations(expenses, ({ one, many }) => ({
//   payer: one(user, {
//     fields: [expenses.payerId],
//     references: [user.id],
//   }),
//   shares: many(expenseShares),
// }));

// export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
//   expense: one(expenses, {
//     fields: [expenseShares.expenseId],
//     references: [expenses.id],
//   }),
//   participant: one(user, {
//     fields: [expenseShares.userId],
//     references: [user.id],
//   }),
// }));

// export const settlementsRelations = relations(settlements, ({ one }) => ({
//   payer: one(user, {
//     fields: [settlements.payerId],
//     references: [user.id],
//   }),
//   payee: one(user, {
//     fields: [settlements.payeeId],
//     references: [user.id],
//   }),
// }));
