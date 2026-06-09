import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireBranchScopedUser, requireRoles } from "../middleware/auth";
import { branchWhere, checkBranchIsolation, enforceBodyBranchIsolation } from "../middleware/branchIsolation";
import { ApiError } from "../middleware/errorHandler";
import { Roles } from "../types/roles";

export const shiftsRouter = Router();

shiftsRouter.use(
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager, Roles.BranchManager, Roles.Chef, Roles.Cashier, Roles.Waiter),
  requireBranchScopedUser
);

shiftsRouter.get("/branch-staff", requireRoles(Roles.BranchManager, Roles.Admin), async (req, res, next) => {
  try {
    const branchId = req.branchId;
    if (!branchId) { res.json([]); return; }
    const staff = await prisma.user.findMany({
      where: { branchId },
      select: { id: true, name: true, role: true, email: true },
      orderBy: { role: "asc" },
    });
    res.json(staff);
  } catch (error) { next(error); }
});

shiftsRouter.get("/", async (req, res, next) => {
  try {
    const where = req.user?.role === Roles.Admin || req.user?.role === Roles.HQManager
      ? (req.query.branchId ? { branchId: req.query.branchId as string } : {})
      : branchWhere(req);
    const shifts = await prisma.shift.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { startTime: "desc" },
    });
    res.json(shifts);
  } catch (error) { next(error); }
});

shiftsRouter.post(
  "/",
  requireRoles(Roles.Admin, Roles.BranchManager),
  enforceBodyBranchIsolation,
  async (req, res, next) => {
    try {
      const { userId, startTime, endTime } = req.body as {
        userId?: string; startTime?: string; endTime?: string;
      };
      if (!userId || !startTime || !endTime) {
        throw new ApiError(400, "userId, startTime and endTime are required");
      }
      if (!req.branchId) throw new ApiError(400, "branchId is required");
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { branchId: true } });
      if (!user) throw new ApiError(404, "User not found");
      if (user.branchId !== req.branchId) {
        throw new ApiError(403, "Cannot schedule a user outside the shift branch");
      }
      const shift = await prisma.shift.create({
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        data: { userId, startTime: new Date(startTime), endTime: new Date(endTime), branchId: req.branchId! },
      });
      res.status(201).json(shift);
    } catch (error) { next(error); }
  }
);

shiftsRouter.put("/:id", requireRoles(Roles.Admin, Roles.BranchManager, Roles.Chef), checkBranchIsolation("shift"), async (req, res, next) => {
  try {
    const { startTime, endTime } = req.body as { startTime?: string; endTime?: string };
    if (!startTime && !endTime) throw new ApiError(400, "startTime or endTime required");
    const shift = await prisma.shift.update({
      where: { id: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      data: {
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
      },
    });
    res.json(shift);
  } catch (error) { next(error); }
});

shiftsRouter.delete("/:id", requireRoles(Roles.Admin, Roles.BranchManager), checkBranchIsolation("shift"), async (req, res, next) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) { next(error); }
});
