import type { NextFunction, Request, Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { ApiError } from "./errorHandler";
import type { JwtPayload, Role } from "../types/roles";
import { Roles, isRole } from "../types/roles";

// Read JWT_SECRET from environment — the app refuses to start without it
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

// Create a signed JWT containing the user's id, role, and branch
export const signAuthToken = (payload: JwtPayload): string => {
  const signOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, getJwtSecret(), signOptions);
};

// Verify the JWT from the Authorization header and attach the decoded user to req.user
export const requireAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  if (!token) { next(new ApiError(401, "Authentication required")); return; }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    if (!decoded.userId || typeof decoded.role !== "number" || !isRole(decoded.role)) {
      throw new ApiError(401, "Invalid token");
    }
    req.user = { userId: decoded.userId, role: decoded.role, branchId: decoded.branchId ?? null };
    next();
  } catch (error) {
    next(error instanceof ApiError ? error : new ApiError(401, "Invalid token"));
  }
};

// Only allow users whose role is in the provided list — returns 403 if role not allowed
export const requireRoles =
  (...allowedRoles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) { next(new ApiError(401, "Authentication required")); return; }
    if (!allowedRoles.includes(req.user.role)) { next(new ApiError(403, "Insufficient permissions")); return; }
    next();
  };

// Set req.branchId: Admin/HQ can pass any branchId, branch staff are locked to their own branch
export const requireBranchScopedUser = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) { next(new ApiError(401, "Authentication required")); return; }
  if (req.user.role === Roles.Admin || req.user.role === Roles.HQManager) {
    req.branchId = req.body.branchId ?? req.query.branchId?.toString();
    next(); return;
  }
  if (!req.user.branchId) { next(new ApiError(403, "User must be assigned to a branch")); return; }
  req.branchId = req.user.branchId;
  next();
};
