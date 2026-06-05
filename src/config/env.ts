import "dotenv/config";
import { z } from "zod";
import { logger } from "./logger";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),

  DATABASE_URL: z.string(),
  PORT: z.string().default("8000"),

  FRONTEND_URL: z.string(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  logger.error(
    { errors: result.error.format() },
    "Invalid environment variables",
  );
  process.exit(1);
}

export const env = result.data;
