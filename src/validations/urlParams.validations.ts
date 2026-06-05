import z from "zod";

export const urlParamsSchema = z.object({
  groupId: z.string().uuid("Invalid group ID").optional(),
  userId: z.string().min(10, "Invalid user ID").optional(),
});
