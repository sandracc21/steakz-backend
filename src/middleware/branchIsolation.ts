import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ApiError } from "./errorHandler";
import { Roles } from "../types/roles";

// The models that belong to a branch and can be isolated
type BranchOwnedModel = "order" | "inventoryItem" | "shift" | "menuItem";

// Lookup functions to fetch only the branchId for each supported model
const modelReaders: Record<
  BranchOwnedModel,
  (id: string) => Promise<{ id: string; branchId: string | null } | null>
> = {
  order: (id) => prisma.order.findUnique({ where: { id }, select: { id: true, branchId: true } }),
  inventoryItem: (id) =>
    prisma.inventoryItem.findUnique({ where: { id }, select: { id: true, branchId: true } }),
  shift: (id) => prisma.shift.findUnique({ where: { id }, select: { id: true, branchId: true } }),
  menuItem: (id) => prisma.menuItem.findUnique({ where: { id }, select: { id: true, branchId: true } }),
};

// Inject the current branch into a Prisma where-clause so queries are automatically scoped
export const branchWhere = <T extends object>(req: Request, where?: T): T & { branchId: string } => {
  if (!req.branchId) {
    throw new ApiError(403, "Branch context is required");
  }

  return {
    ...(where ?? ({} as T)),
    branchId: req.branchId
  };
};

// Prevent non-Admin staff from writing data to a different branch than their own
export const enforceBodyBranchIsolation = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    next(new ApiError(401, "Authentication required"));
    return;
  }

  if (req.user.role === Roles.Admin) {
    next();
    return;
  }

  const requestedBranchId = typeof req.body.branchId === "string" ? req.body.branchId : undefined;
  if (requestedBranchId && requestedBranchId !== req.user.branchId) {
    next(new ApiError(403, "Cannot access or write data for another branch"));
    return;
  }

  req.body.branchId = req.user.branchId;
  next();
};

// Confirm the resource being accessed belongs to the same branch as the logged-in user
export const checkBranchIsolation =
  (model: BranchOwnedModel, idParam = "id") =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ApiError(401, "Authentication required");
      }

      // Admin and HQ can access any branch's data
      if (req.user.role === Roles.Admin || req.user.role === Roles.HQManager) {
        next();
        return;
      }

      if (!req.user.branchId) {
        throw new ApiError(403, "Branch-scoped users must be assigned to a branch");
      }

      const id = req.params[idParam];
      if (!id) {
        throw new ApiError(400, `Missing route parameter: ${idParam}`);
      }

      const record = await modelReaders[model](id);
      if (!record) {
        throw new ApiError(404, "Resource not found");
      }

      // Block access if the record belongs to a different branch
      if (!record.branchId || record.branchId !== req.user.branchId) {
        throw new ApiError(403, "Cannot access or alter data from another branch");
      }

      req.branchId = req.user.branchId;
      next();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        next(new ApiError(400, error.message));
        return;
      }
      next(error);
    }
  };
