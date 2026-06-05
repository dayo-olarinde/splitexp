import "dotenv/config";
import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";

const PORT = env.PORT || 7000;
const NODE_ENV = env.NODE_ENV;

const server = app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  logger.info(`Working environment: ${NODE_ENV}`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info("Process terminated");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION! 💥 Shutting down...");
  logger.error(err);
  server.close(() => {
    process.exit(1);
  });
});
