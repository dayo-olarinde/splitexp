export class ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;

  constructor(statusCode: number = 200, message: string = "Success", data?: T) {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;

    if (data !== undefined) {
      this.data = data;
    }
  }
}

export class ApiError extends Error {
  success: boolean;
  statusCode: number;
  errors?: { field: string; message: string }[];
  isOperational: boolean;

  constructor(
    statusCode: number = 500,
    message: string = "Something went wrong",
    errors?: { field: string; message: string }[],
  ) {
    super(message);
    this.success = false;
    this.statusCode = statusCode;
    this.message = message;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}
