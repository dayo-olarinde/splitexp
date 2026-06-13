import "better-auth";
import type { InferSelectModel } from "drizzle-orm";
import type { groupMembers } from "../db/schema";

declare global {
  namespace Express {
    interface Request {
      user?: import("better-auth").User;
      session?: import("better-auth").Session;
      member?: {
        id: string;
        user_id: string;
        group_id: string;
        role: "admin" | "member";
        created_at: string;
      };
    }
  }
}
