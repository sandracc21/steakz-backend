import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { requireAuth, requireRoles } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { Roles, isRole } from "../types/roles";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRoles(Roles.Admin));

adminRouter.get("/branches", async (_req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      include: { _count: { select: { users: true, orders: true, inventoryItems: true } } },
      orderBy: { name: "asc" },
    });
    res.json(branches);
  } catch (error) { next(error); }
});

adminRouter.post("/branches", async (req, res, next) => {
  try {
    const { name, location } = req.body as { name?: string; location?: string };
    if (!name || !location) throw new ApiError(400, "name and location are required");
    const branch = await prisma.branch.create({ data: { name, location } });

    const globalMenuItems = await prisma.menuItem.findMany({ where: { branchId: null } });
    for (const item of globalMenuItems) {
      const newItem = await prisma.menuItem.create({
        data: {
          name: item.name,
          description: item.description,
          category: item.category,
          price: item.price,
          available: item.available,
          branchId: branch.id,
        },
      });
      await prisma.inventoryItem.create({
        data: { itemName: newItem.name, quantity: 5, status: "Normal", branchId: branch.id },
      });
    }

    res.status(201).json(branch);
  } catch (error) { next(error); }
});

adminRouter.delete("/branches/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.review.deleteMany({ where: { branchId: id } });
    await prisma.reservation.deleteMany({ where: { branchId: id } });
    await prisma.inventoryItem.deleteMany({ where: { branchId: id } });
    await prisma.shift.deleteMany({ where: { branchId: id } });
    await prisma.order.deleteMany({ where: { branchId: id } });
    await prisma.menuItem.deleteMany({ where: { branchId: id } });
    await prisma.user.updateMany({ where: { branchId: id }, data: { branchId: null } });
    await prisma.branch.delete({ where: { id } });
    res.json({ message: "Branch deleted successfully" });
  } catch (error) { next(error); }
});

adminRouter.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, name: true, role: true, branchId: true,
        branch: { select: { id: true, name: true, location: true } },
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (error) { next(error); }
});

adminRouter.post("/users", async (req, res, next) => {
  try {
    const { email, password, name, role, branchId } = req.body as {
      email?: string; password?: string; name?: string; role?: number; branchId?: string;
    };
    if (!email || !password || !name || role === undefined) {
      throw new ApiError(400, "email, password, name and role are required");
    }
    if (!isRole(role)) throw new ApiError(400, "Invalid role");
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) throw new ApiError(409, "Email already in use");
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role, branchId: branchId ?? null },
      select: {
        id: true, email: true, name: true, role: true, branchId: true,
        branch: { select: { id: true, name: true, location: true } },
        createdAt: true, updatedAt: true,
      },
    });
    res.status(201).json(user);
  } catch (error) { next(error); }
});

adminRouter.put("/users/:id", async (req, res, next) => {
  try {
    const { email, password, name, role, branchId } = req.body as {
      email?: string; password?: string; name?: string; role?: number; branchId?: string | null;
    };
    if (role !== undefined && !isRole(role)) throw new ApiError(400, "Invalid role");
    const hashed = password ? await bcrypt.hash(password, 12) : undefined;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { email, name, role, branchId, ...(hashed ? { password: hashed } : {}) },
      select: {
        id: true, email: true, name: true, role: true, branchId: true,
        branch: { select: { id: true, name: true, location: true } },
        createdAt: true, updatedAt: true,
      },
    });
    res.json(user);
  } catch (error) { next(error); }
});

adminRouter.delete("/users/:id", async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) { next(error); }
});
