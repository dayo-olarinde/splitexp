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

  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().optional(),
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
