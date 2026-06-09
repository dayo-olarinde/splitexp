import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../config/env";
import { logger } from "../config/logger";
import * as schema from "../db/schema/index";

const connectionString = env.DATABASE_URL;

const queryClient = postgres(connectionString, {
  ssl: "require",
  max: 10,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(queryClient, {
  schema,
  logger: env.NODE_ENV === "development",
});

export const pg = queryClient;

export const closeDb = async () => {
  logger.info("Closing database connection...");
  await queryClient.end();
};
