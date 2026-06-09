import { InventoryStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireBranchScopedUser, requireRoles } from "../middleware/auth";
import { branchWhere, checkBranchIsolation, enforceBodyBranchIsolation } from "../middleware/branchIsolation";
import { ApiError } from "../middleware/errorHandler";
import { Roles } from "../types/roles";

export const inventoryRouter = Router();

inventoryRouter.use(
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager, Roles.BranchManager, Roles.Chef),
  requireBranchScopedUser
);

inventoryRouter.get("/", async (req, res, next) => {
  try {
    const where = req.user?.role === Roles.Admin || req.user?.role === Roles.HQManager
      ? (req.query.branchId ? { branchId: req.query.branchId as string } : {})
      : branchWhere(req);
    const items = await prisma.inventoryItem.findMany({ where, orderBy: { itemName: "asc" } });
    res.json(items);
  } catch (error) { next(error); }
});

inventoryRouter.post(
  "/",
  requireRoles(Roles.Admin, Roles.BranchManager, Roles.Chef),
  enforceBodyBranchIsolation,
  async (req, res, next) => {
    try {
      const { itemName, quantity, status } = req.body as {
        itemName?: string; quantity?: number; status?: InventoryStatus;
      };
      if (!itemName || quantity === undefined) throw new ApiError(400, "itemName and quantity are required");
      if (status && !Object.values(InventoryStatus).includes(status)) throw new ApiError(400, "Invalid status");
      if (!req.branchId) throw new ApiError(400, "branchId is required");

      const branchId = req.branchId!;
      const trimmedName = itemName.trim();
      const existing = await prisma.inventoryItem.findFirst({
        where: { branchId, itemName: trimmedName },
      });

      let item;
      if (existing) {
        const newQty = existing.quantity + Number(quantity);
        item = await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { quantity: newQty, status: newQty <= 4 ? "LowStock" : "Normal" },
        });
        if (newQty > 0) {
          await prisma.menuItem.updateMany({
            where: { name: trimmedName, branchId },
            data: { available: true },
          });
        }
      } else {
        const qty = Number(quantity);
        item = await prisma.inventoryItem.create({
          data: { itemName: trimmedName, quantity: qty, status: qty <= 4 ? "LowStock" : "Normal", branchId },
        });
        if (qty > 0) {
          await prisma.menuItem.updateMany({
            where: { name: trimmedName, branchId },
            data: { available: true },
          });
        }
      }

      res.status(201).json(item);
    } catch (error) { next(error); }
  }
);

inventoryRouter.put("/:id", requireRoles(Roles.Admin, Roles.BranchManager, Roles.Chef), checkBranchIsolation("inventoryItem"), async (req, res, next) => {
  try {
    const { itemName, quantity, status } = req.body as {
      itemName?: string; quantity?: number; status?: InventoryStatus;
    };
    if (status && !Object.values(InventoryStatus).includes(status)) throw new ApiError(400, "Invalid status");

    const existing = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new ApiError(404, "Inventory item not found");

    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: {
        ...(itemName !== undefined && { itemName }),
        ...(quantity !== undefined && {
          quantity,
          status: quantity <= 4 ? "LowStock" : "Normal",
        }),
        ...(quantity === undefined && status !== undefined && { status }),
      },
    });

    if (quantity !== undefined) {
      if (quantity === 0) {
        await prisma.menuItem.updateMany({
          where: { name: existing.itemName, branchId: existing.branchId },
          data: { available: false },
        });
      } else {
        await prisma.menuItem.updateMany({
          where: { name: existing.itemName, branchId: existing.branchId },
          data: { available: true },
        });
      }
    }

    res.json(item);
  } catch (error) { next(error); }
});

inventoryRouter.delete("/:id", requireRoles(Roles.Admin, Roles.BranchManager), checkBranchIsolation("inventoryItem"), async (req, res, next) => {
  try {
    const invItem = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!invItem) throw new ApiError(404, "Inventory item not found");

    await prisma.inventoryItem.delete({ where: { id: req.params.id } });

    await prisma.menuItem.updateMany({
      where: { name: invItem.itemName, branchId: invItem.branchId },
      data: { available: false },
    });

    res.json({ message: "Item removed from inventory. Menu item marked as unavailable." });
  } catch (error) { next(error); }
});
