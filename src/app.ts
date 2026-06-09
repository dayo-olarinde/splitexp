import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";
import helmet from "helmet";

import { env } from "./config/env";
import { logger } from "./config/logger";
import {
  globalErrorHandler,
  notFoundError,
} from "./middleware/error.middleware";
import { globalApiLimiter } from "./middleware/rate-limit.middleware";

import { toNodeHandler } from "better-auth/node";
import { auth } from "./config/auth";

import groupRoutes from "./routes/group.routes";
import expenseRoutes from "./routes/expense.routes";
import settlementRoutes from "./routes/settlement.route";

export const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth")) return next();
  globalApiLimiter(req, res, next);
});
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.url !== "/health") logger.info(`[${req.method}] ${req.url}`);
  next();
});

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "up",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.all("/api/auth/*", toNodeHandler(auth));
app.use("/api/v1/groups", groupRoutes);
app.use("/api/v1/groups/:groupId", expenseRoutes);
app.use("/api/v1/groups/:groupId", settlementRoutes);

app.use(notFoundError);
app.use(globalErrorHandler);
