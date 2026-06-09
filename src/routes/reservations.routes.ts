import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRoles } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { Roles } from "../types/roles";
import { ReservationStatus } from "@prisma/client";

export const reservationsRouter = Router();

// GET /reservations/my — Customer sees their own reservations (must be before /:id routes)
reservationsRouter.get(
  "/my",
  requireAuth,
  requireRoles(Roles.Customer),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) throw new ApiError(404, "User not found");
      const reservations = await prisma.reservation.findMany({
        where: { customerName: user.name },
        orderBy: { date: "desc" },
        take: 20,
        include: { branch: { select: { name: true } } },
      });
      res.json(reservations);
    } catch (error) { next(error); }
  }
);

// GET /reservations — branch staff see their branch reservations
reservationsRouter.get(
  "/",
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager, Roles.BranchManager, Roles.Waiter, Roles.Cashier, Roles.Chef),
  async (req, res, next) => {
    try {
      const user = req.user!;
      const where =
        user.role === Roles.Admin || user.role === Roles.HQManager
          ? req.query.branchId ? { branchId: req.query.branchId as string } : {}
          : { branchId: user.branchId! };
      const reservations = await prisma.reservation.findMany({
        where,
        orderBy: { date: "asc" },
        include: { branch: { select: { name: true } } },
      });
      res.json(reservations);
    } catch (error) { next(error); }
  }
);

// POST /reservations — customer creates a reservation (no auth required)
reservationsRouter.post("/", async (req, res, next) => {
  try {
    const { customerName, customerEmail, partySize, tableNumber, date, notes, items, totalAmount, branchId } = req.body;
    if (!customerName || !partySize || !tableNumber || !date || !branchId || !items) {
      throw new ApiError(400, "Missing required fields");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(400, "Please select at least one item");
    }
    const dateObj = new Date(date);
    // Check within a 1-hour window either side of the requested time to prevent double-booking
    const hourStart = new Date(dateObj.getTime() - 60 * 60 * 1000);
    const hourEnd   = new Date(dateObj.getTime() + 60 * 60 * 1000);
    const conflict = await prisma.reservation.findFirst({
      where: {
        branchId,
        tableNumber: Number(tableNumber),
        status: { in: [ReservationStatus.Pending, ReservationStatus.Seated] },
        date: { gte: hourStart, lte: hourEnd },
      },
    });
    if (conflict) {
      throw new ApiError(409, `Table ${tableNumber} is already reserved around that time. Please choose a different table or time.`);
    }
    const reservation = await prisma.reservation.create({
      data: {
        customerName: customerName.trim(),
        customerEmail: customerEmail?.trim() ?? null,
        partySize: Number(partySize),
        tableNumber: Number(tableNumber),
        date: dateObj,
        notes: notes?.trim() ?? null,
        items,
        totalAmount: Number(totalAmount),
        branchId,
        status: ReservationStatus.Pending,
      },
    });
    res.status(201).json(reservation);
  } catch (error) { next(error); }
});

// PUT /reservations/:id/seat — waiter seats the customer and automatically creates a kitchen order
reservationsRouter.put(
  "/:id/seat",
  requireAuth,
  requireRoles(Roles.Admin, Roles.BranchManager, Roles.Waiter),
  async (req, res, next) => {
    try {
      const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } });
      if (!reservation) throw new ApiError(404, "Reservation not found");
      if (reservation.status !== ReservationStatus.Pending) throw new ApiError(400, "Reservation is not pending");

      // Create an order from the reservation's pre-ordered items so the kitchen can start immediately
      await prisma.order.create({
        data: {
          tableNumber: reservation.tableNumber,
          items: reservation.items as object,
          totalAmount: reservation.totalAmount,
          status: "Pending",
          customerName: reservation.customerName,
          customerPhone: null,
          notes: reservation.notes,
          orderSource: "Reservation",
          branchId: reservation.branchId,
        },
      });

      // Mark the reservation as Seated so it no longer shows as pending
      const updated = await prisma.reservation.update({
        where: { id: req.params.id },
        data: { status: ReservationStatus.Seated },
      });
      res.json(updated);
    } catch (error) { next(error); }
  }
);

// PUT /reservations/:id/cancel — Manager or Admin cancels
reservationsRouter.put(
  "/:id/cancel",
  requireAuth,
  requireRoles(Roles.Admin, Roles.BranchManager),
  async (req, res, next) => {
    try {
      const updated = await prisma.reservation.update({
        where: { id: req.params.id },
        data: { status: ReservationStatus.Cancelled },
      });
      res.json(updated);
    } catch (error) { next(error); }
  }
);
