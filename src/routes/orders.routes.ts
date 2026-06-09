import { OrderStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireBranchScopedUser, requireRoles } from "../middleware/auth";
import { branchWhere, checkBranchIsolation, enforceBodyBranchIsolation } from "../middleware/branchIsolation";
import { ApiError } from "../middleware/errorHandler";
import { Roles } from "../types/roles";
import { formatOrderResponse, formatOrderResponses } from "../utils/responseShapes";

export const ordersRouter = Router();

ordersRouter.get(
  "/my",
  requireAuth,
  requireRoles(Roles.Customer),
  async (req, res, next) => {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!dbUser) throw new ApiError(404, "User not found");
      const orders = await prisma.order.findMany({
        where: { customerName: dbUser.name },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      res.json(formatOrderResponses(orders));
    } catch (error) { next(error); }
  }
);

ordersRouter.use(
  requireAuth,
  requireRoles(
    Roles.Admin,
    Roles.HQManager,
    Roles.BranchManager,
    Roles.Chef,
    Roles.Cashier,
    Roles.Waiter
  ),
  requireBranchScopedUser
);

ordersRouter.get("/", async (req, res, next) => {
  try {
    const where = req.user?.role === Roles.Admin || req.user?.role === Roles.HQManager
      ? (req.query.branchId ? { branchId: req.query.branchId as string } : {})
      : branchWhere(req);
    const orders = await prisma.order.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json(formatOrderResponses(orders));
  } catch (error) { next(error); }
});

ordersRouter.get("/:id", checkBranchIsolation("order"), async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new ApiError(404, "Order not found");
    res.json(formatOrderResponse(order));
  } catch (error) { next(error); }
});

ordersRouter.post(
  "/",
  requireRoles(Roles.Admin, Roles.BranchManager, Roles.Cashier, Roles.Waiter),
  enforceBodyBranchIsolation,
  async (req, res, next) => {
    try {
      const { tableNumber, items, totalAmount, customerName } = req.body as {
        tableNumber?: number; items?: Prisma.InputJsonValue; totalAmount?: number | string; customerName?: string;
      };
      if (typeof tableNumber !== "number" || !items || totalAmount === undefined) {
        throw new ApiError(400, "tableNumber, items, and totalAmount are required");
      }
      if (!req.branchId) throw new ApiError(400, "branchId is required");
      const order = await prisma.order.create({
        data: { tableNumber, items, totalAmount, branchId: req.branchId!, customerName: customerName?.trim() || null },
      });
      res.status(201).json(formatOrderResponse(order));
    } catch (error) { next(error); }
  }
);

ordersRouter.put(
  "/:id/status",
  requireRoles(Roles.Admin, Roles.BranchManager, Roles.Chef, Roles.Cashier, Roles.Waiter),
  checkBranchIsolation("order"),
  async (req, res, next) => {
    try {
      const { status } = req.body as { status?: OrderStatus };
      if (!status || !Object.values(OrderStatus).includes(status)) {
        throw new ApiError(400, "Valid status required (Pending|Preparing|Served|Paid)");
      }

      const current = await prisma.order.findUnique({ where: { id: req.params.id } });
      if (!current) throw new ApiError(404, "Order not found");

      const role = req.user!.role;
      const from = current.status;
      const to   = status;

      const isManager = role === Roles.Admin || role === Roles.BranchManager;

      if (!isManager) {
        if (role === Roles.Chef) {
          if (!(from === "Pending" && to === "Preparing")) {
            throw new ApiError(403, `Chef can only move orders from Pending to Preparing. Current status: ${from}`);
          }
        } else if (role === Roles.Waiter) {
          if (!(from === "Preparing" && to === "Served")) {
            throw new ApiError(403, `Waiter can only mark Preparing orders as Served. Current status: ${from}`);
          }
        } else if (role === Roles.Cashier) {
          if (!(from === "Served" && to === "Paid")) {
            throw new ApiError(403, `Cashier can only mark Served orders as Paid. Current status: ${from}`);
          }
        }
      }

      const updatedOrder = await prisma.order.update({ where: { id: req.params.id }, data: { status } });

      if (to === "Paid" && Array.isArray(updatedOrder.items)) {
        for (const item of updatedOrder.items as { name: string; quantity: number }[]) {
          const invItem = await prisma.inventoryItem.findFirst({
            where: { branchId: updatedOrder.branchId, itemName: item.name },
          });
          if (invItem) {
            const newQty = Math.max(0, invItem.quantity - item.quantity);
            const newStatus = newQty <= 4 ? "LowStock" as const : "Normal" as const;
            await prisma.inventoryItem.update({
              where: { id: invItem.id },
              data: { quantity: newQty, status: newStatus },
            });
            if (newQty === 0) {
              await prisma.menuItem.updateMany({
                where: { name: item.name, branchId: updatedOrder.branchId },
                data: { available: false },
              });
            }
          }
        }
      }

      res.json(formatOrderResponse(updatedOrder));
    } catch (error) { next(error); }
  }
);

ordersRouter.delete(
  "/:id",
  requireRoles(Roles.Admin, Roles.BranchManager, Roles.Cashier, Roles.Waiter),
  checkBranchIsolation("order"),
  async (req, res, next) => {
    try {
      await prisma.order.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (error) { next(error); }
  }
);
