import "better-auth";
import type { InferSelectModel } from "drizzle-orm";
import type { groupMembers } from "../db/schema";

declare global {
  namespace Express {
    interface Request {
      user?: import("better-auth").User;
      session?: import("better-auth").Session;
      member?: InferSelectModel<typeof groupMembers>;
    }
  }
}
