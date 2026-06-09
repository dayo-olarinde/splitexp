import { z } from "zod";

export const createSettlementSchema = z
  .object({
    payeeId: z.string().min(10, "Payee ID is required"),
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid amount (e.g., 120.00)"),
  })
  .superRefine((data, ctx) => {
    if (Number(data.amount) <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Settlement amount must be greater than zero",
        path: ["amount"],
      });
    }
  });

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;
