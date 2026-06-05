import { z } from "zod";

export const createGroupSchema = z.object({
  name: z.string().min(2, "Group name must be at least 2 characters").max(50),
  description: z.string().max(255).optional(),
});

export const addMemberToGroup = z.object({
  email: z.string().email("Please enter a valid email"),
});

export const changeRoleSchema = z.object({
  role: z.enum(["admin", "member"], {
    message: "Role must be either 'admin' or 'member'",
  }),
});

export const updateGroupSchema = z.object({
  name: z.string().max(50).optional(),
  description: z.string().max(255).optional(),
});

export type UpdateGroupSchema = z.infer<typeof updateGroupSchema>;
