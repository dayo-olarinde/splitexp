import { z } from "zod";

export const createExpenseSchema = z
  .object({
    description: z.string().min(1, "Description is required"),
    category: z.string().optional(),
    totalAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid amount (e.g., 120.00)"),
    payerId: z.string().min(10, "Payer ID is required"),
    splitType: z.enum(["equal", "percentage", "exact"]),
    participants: z
      .array(
        z.object({
          userId: z.string().min(10, "Invalid user ID"),
          amount: z
            .string()
            .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid amount")
            .optional(),
          percentage: z
            .string()
            .regex(/^\d+(\.\d{1,2})?$/, "Must be a valid percentage")
            .optional(),
        }),
      )
      .min(1, "Must have at least one participant"),
  })
  .superRefine((data, ctx) => {
    data.participants.forEach((participant, index) => {
      if (data.splitType === "exact" && !participant.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Amount is required for exact splits",
          path: ["participants", index, "amount"],
        });
      }

      if (data.splitType === "percentage" && !participant.percentage) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percentage is required for percentage splits",
          path: ["participants", index, "percentage"],
        });
      }
    });
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
