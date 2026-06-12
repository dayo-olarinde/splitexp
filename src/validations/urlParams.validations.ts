import z from "zod";

export const urlParamsSchema = z.object({
  userId: z.string().min(10, "Invalid user ID").optional(),
  groupId: z.string().uuid("Invalid group ID").optional(),
  expenseId: z.string().uuid("Invalid expense ID").optional(),
  settlementId: z.string().uuid("Invalid settlement ID").optional(),
});
