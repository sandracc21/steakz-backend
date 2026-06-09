import { OrderStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma";
import { ApiError } from "../middleware/errorHandler";
import { formatMenuItemResponses, formatOrderResponse } from "../utils/responseShapes";

export const publicRouter = Router();

type PublicOrderItem = {
  name?: unknown;
  quantity?: unknown;
  price?: unknown;
};

const isValidOrderItem = (item: PublicOrderItem): boolean =>
  typeof item.name === "string" &&
  item.name.trim().length > 0 &&
  typeof item.quantity === "number" &&
  item.quantity > 0 &&
  typeof item.price === "number" &&
  item.price >= 0;

publicRouter.get("/check-name", async (req, res, next) => {
  try {
    const name = req.query.name as string;
    const withEmail = req.query.withEmail === "true";
    if (!name?.trim()) { res.json({ exists: false }); return; }
    const user = await prisma.user.findFirst({
      where: { name: { equals: name.trim(), mode: "insensitive" }, role: 6 },
      select: { id: true, name: true, email: true },
    });
    if (withEmail) {
      res.json({ exists: !!user, email: user?.email ?? null });
    } else {
      res.json({ exists: !!user });
    }
  } catch (error) { next(error); }
});

publicRouter.get("/tables", async (req, res, next) => {
  try {
    const branchId = req.query.branchId as string;
    if (!branchId) { res.json({ occupiedTables: [] }); return; }
    const activeOrders = await prisma.order.findMany({
      where: {
        branchId,
        status: { in: ["Pending", "Preparing", "Served"] as OrderStatus[] },
        tableNumber: { gt: 0 },
      },
      select: { tableNumber: true },
    });
    const occupiedTables = [...new Set(activeOrders.map((o) => o.tableNumber))];
    res.json({ occupiedTables });
  } catch (error) { next(error); }
});

publicRouter.get("/branches", async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      select: { id: true, name: true, location: true },
      orderBy: { name: "asc" },
    });
    res.json(branches);
  } catch (error) { next(error); }
});

publicRouter.get("/menu", async (req, res, next) => {
  try {
    const branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    const items = await prisma.menuItem.findMany({
      where: {
        ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json(formatMenuItemResponses(items));
  } catch (error) { next(error); }
});

publicRouter.post("/orders", async (req, res, next) => {
  try {
    const {
      branchId,
      tableNumber,
      items,
      totalAmount,
      customerName,
      customerPhone,
      notes,
    } = req.body as {
      branchId?: string;
      tableNumber?: number;
      items?: PublicOrderItem[];
      totalAmount?: number | string;
      customerName?: string;
      customerPhone?: string;
      notes?: string;
    };

    if (!branchId) throw new ApiError(400, "branchId is required");
    if (typeof tableNumber !== "number") throw new ApiError(400, "tableNumber is required");
    if (!Array.isArray(items) || items.length === 0 || !items.every(isValidOrderItem)) {
      throw new ApiError(400, "items must contain name, quantity, and price");
    }
    if (totalAmount === undefined || Number(totalAmount) < 0) {
      throw new ApiError(400, "totalAmount is required");
    }
    if (!customerName?.trim()) throw new ApiError(400, "customerName is required");
    if (!customerPhone?.trim()) throw new ApiError(400, "customerPhone is required");

    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw new ApiError(404, "Branch not found");

    if (customerName?.trim()) {
      const existingActive = await prisma.order.findFirst({
        where: {
          customerName: { equals: customerName.trim(), mode: "insensitive" },
          status: { in: ["Pending", "Preparing", "Served"] },
        },
      });
      if (existingActive) {
        throw new ApiError(409, `You already have an active order at Table ${existingActive.tableNumber}. Please wait until it is completed before placing a new one.`);
      }
    }

    const order = await prisma.order.create({
      data: {
        branchId,
        tableNumber,
        items: items as Prisma.InputJsonValue,
        totalAmount,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        notes: notes?.trim() || null,
        orderSource: "Customer",
      },
    });

    res.status(201).json(formatOrderResponse(order));
  } catch (error) { next(error); }
});
