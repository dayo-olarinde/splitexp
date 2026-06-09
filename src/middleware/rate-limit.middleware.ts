import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { ApiResponse } from "../utils/api-response";

interface CreateLimiterOptions {
  keyGenerator?: (req: Request) => string | undefined;
  max: number;
  windowMinutes: number;
  message?: string;
}

export const createLimiter = ({
  keyGenerator,
  max,
  windowMinutes,
  message,
}: CreateLimiterOptions) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    keyGenerator: (req: Request) => {
      if (keyGenerator) {
        const key = keyGenerator(req);
        if (key) return key;
      }
      return ipKeyGenerator(req as any);
    },
    handler: (req, res) => {
      res
        .status(429)
        .json(
          new ApiResponse(
            429,
            message || "Too many requests. Please slow down and try again.",
            null,
          ),
        );
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

// 1. Global API Limiter (Mount this on /api in app.ts)
export const globalApiLimiter = createLimiter({
  max: 150,
  windowMinutes: 15,
});

// 2. Financial Operation Limiter (Mount on POST /expenses and POST /settlements)
export const financialTransactionLimiter = createLimiter({
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req as any),
  max: 15,
  windowMinutes: 1,
  message: "You are logging transactions too quickly. Please wait a minute.",
});

// 3. Group Creation Limiter (Mount on POST /groups)
export const createGroupLimiter = createLimiter({
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req as any),
  max: 10,
  windowMinutes: 60,
  message: "You have reached the limit for creating new groups for now.",
});
