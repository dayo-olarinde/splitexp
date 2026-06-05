import type { NextFunction, Request, Response } from "express";
import type { z, ZodTypeAny } from "zod";
import { ApiError } from "../utils/api-response";
import { asyncHandler } from "../utils/async-handler";

export const validateInput = <T extends ZodTypeAny>(schema: T) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      throw new ApiError(400, "Validation failed", errors);
    }

    req.body = result.data as z.infer<T>;
    next();
  });

export const validateUrlParams = <T extends ZodTypeAny>(schema: T) => {
  return asyncHandler(
    async (req: Request, _res: Response, next: NextFunction) => {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
        throw new ApiError(400, "Invalid route parameters", errors);
      }

      req.params = result.data as Record<string, string>;
      next();
    },
  );
};
