import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  const message = statusCode === 500 ? "Internal server error" : error.message;

  res.status(statusCode).json({ message });
};
