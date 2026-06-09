import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRoles } from "../middleware/auth";
import { Roles } from "../types/roles";
import { formatOrderResponses } from "../utils/responseShapes";

export const hqRouter = Router();
hqRouter.use(requireAuth, requireRoles(Roles.HQManager, Roles.Admin));

hqRouter.get("/branches", async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      include: { _count: { select: { orders: true, users: true, inventoryItems: true } } },
      orderBy: { name: "asc" },
    });
    res.json(branches);
  } catch (error) { next(error); }
});

hqRouter.get("/orders", async (req, res, next) => {
  try {
    const where = req.query.branchId ? { branchId: req.query.branchId as string } : {};
    const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(formatOrderResponses(orders));
  } catch (error) { next(error); }
});

hqRouter.get("/inventory", async (req, res, next) => {
  try {
    const where = req.query.branchId ? { branchId: req.query.branchId as string } : {};
    const items = await prisma.inventoryItem.findMany({ where, orderBy: { itemName: "asc" } });
    res.json(items);
  } catch (error) { next(error); }
});

hqRouter.get("/shifts", async (req, res, next) => {
  try {
    const where = req.query.branchId ? { branchId: req.query.branchId as string } : {};
    const shifts = await prisma.shift.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { startTime: "desc" },
    });
    res.json(shifts);
  } catch (error) { next(error); }
});
