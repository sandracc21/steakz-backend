import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";
import { ApiError } from "../middleware/errorHandler";
import { signAuthToken } from "../middleware/auth";
import { isRole, type Role } from "../types/roles";

export const authRouter = Router();

// POST /auth/login — verify email and password, return a JWT token and user details
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) throw new ApiError(400, "Email and password are required");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new ApiError(401, "Invalid email or password");
    // Compare the submitted password against the stored bcrypt hash
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new ApiError(401, "Invalid email or password");
    if (!isRole(user.role)) throw new ApiError(403, "Unsupported role");
    // Create a signed JWT containing userId, role, and branchId
    const token = signAuthToken({ userId: user.id, role: user.role, branchId: user.branchId });
    let branchName: string | null = null;
    if (user.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: user.branchId }, select: { name: true } });
      branchName = branch?.name ?? null;
    }
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId, branchName },
    });
  } catch (error) { next(error); }
});

// POST /auth/register — create a new user account and return a JWT token
authRouter.post("/register", async (req, res, next) => {
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
    // Hash the password before storing it
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, name, role, branchId: branchId ?? null },
    });
    // Issue a token immediately so the user is logged in after registering
    const token = signAuthToken({ userId: user.id, role: user.role as Role, branchId: user.branchId });
    let branchName: string | null = null;
    if (user.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: user.branchId }, select: { name: true } });
      branchName = branch?.name ?? null;
    }
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId, branchName },
    });
  } catch (error) { next(error); }
});
