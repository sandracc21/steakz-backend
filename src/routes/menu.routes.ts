import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireBranchScopedUser, requireRoles } from "../middleware/auth";
import { checkBranchIsolation, enforceBodyBranchIsolation } from "../middleware/branchIsolation";
import { ApiError } from "../middleware/errorHandler";
import { Roles } from "../types/roles";
import { formatMenuItemResponse, formatMenuItemResponses } from "../utils/responseShapes";

export const menuRouter = Router();

menuRouter.get(
  "/manage",
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager, Roles.BranchManager),
  requireBranchScopedUser,
  async (req, res, next) => {
    try {
      const where = req.branchId
        ? { OR: [{ branchId: req.branchId }, { branchId: null }] }
        : {};
      const items = await prisma.menuItem.findMany({ where, orderBy: { category: "asc" } });
      res.json(formatMenuItemResponses(items));
    } catch (error) { next(error); }
  }
);

menuRouter.post(
  "/",
  requireAuth,
  requireRoles(Roles.Admin, Roles.BranchManager),
  requireBranchScopedUser,
  enforceBodyBranchIsolation,
  async (req, res, next) => {
    try {
      const { name, description, category, price, available } = req.body as {
        name?: string; description?: string; category?: string; price?: number; available?: boolean;
      };
      if (!name || !category || price === undefined) {
        throw new ApiError(400, "name, category, and price are required");
      }
      const item = await prisma.menuItem.create({
        data: {
          name,
          description: description ?? "",
          category,
          price,
          available: available ?? true,
          branchId: req.branchId ?? null,
        },
      });

      if (item.branchId) {
        await prisma.inventoryItem.create({
          data: { itemName: item.name, quantity: 5, status: "Normal", branchId: item.branchId },
        });
      } else {
        const branches = await prisma.branch.findMany();
        for (const branch of branches) {
          await prisma.inventoryItem.create({
            data: { itemName: item.name, quantity: 5, status: "Normal", branchId: branch.id },
          });
        }
      }

      res.status(201).json(formatMenuItemResponse(item));
    } catch (error) { next(error); }
  }
);

menuRouter.put(
  "/:id",
  requireAuth,
  requireRoles(Roles.Admin, Roles.BranchManager),
  checkBranchIsolation("menuItem"),
  async (req, res, next) => {
    try {
      const { name, description, category, price, available } = req.body as {
        name?: string; description?: string; category?: string; price?: number; available?: boolean;
      };
      const item = await prisma.menuItem.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(category !== undefined && { category }),
          ...(price !== undefined && { price }),
          ...(available !== undefined && { available }),
        },
      });
      res.json(formatMenuItemResponse(item));
    } catch (error) { next(error); }
  }
);

menuRouter.delete(
  "/:id",
  requireAuth,
  requireRoles(Roles.Admin, Roles.BranchManager),
  checkBranchIsolation("menuItem"),
  async (req, res, next) => {
    try {
      await prisma.menuItem.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) { next(error); }
  }
);
