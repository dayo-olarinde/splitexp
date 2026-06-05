import type { NextFunction, Request, Response } from "express";
import postgres from "postgres";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ApiError } from "../utils/api-response";

export const notFoundError = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  next(new ApiError(404, `Cannot find ${req.originalUrl} on this server.`));
};

export const globalErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let error = err;

  if (err instanceof postgres.PostgresError) {
    if (err.code === "23505") {
      // Unique constraint violation
      const field = err.detail?.match(/Key \((.*?)\)=/)?.[1] || "field";
      error = new ApiError(409, `This ${field} is already in use.`);
    } else if (err.code === "23503") {
      // Foreign key violation
      error = new ApiError(400, "Referenced record does not exist.");
    } else if (err.code === "22P02") {
      // Invalid text representation (e.g., bad UUID format)
      error = new ApiError(400, "Invalid data format provided.");
    }
  }

  if (!(error instanceof ApiError)) {
    error = new ApiError(500, "Something went wrong. Please try again.");
  }

  if (error.statusCode === 500) {
    logger.error({
      statusCode: error.statusCode,
      message: err.message || error.message,
      path: req.originalUrl,
      method: req.method,
      stack: err.stack,
    });
  } else {
    logger.warn(
      `[${req.method} ${req.originalUrl}] ${error.statusCode} - ${error.message}`,
    );
  }

  const responsePayload = {
    success: false,
    message: error.message,
    ...(error.errors && { errors: error.errors }),
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  };

  res.status(error.statusCode).json(responsePayload);
};
