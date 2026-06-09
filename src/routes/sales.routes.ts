import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireBranchScopedUser, requireRoles } from "../middleware/auth";
import { Roles } from "../types/roles";
import { formatOrderResponse } from "../utils/responseShapes";

export const salesRouter = Router();

// GET /sales/summary — revenue and order counts for the user's branch (or all branches for Admin/HQ)
salesRouter.get(
  "/summary",
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager, Roles.BranchManager),
  requireBranchScopedUser,
  async (req, res, next) => {
    try {
      const branchId = req.branchId;
      const branches = branchId
        ? await prisma.branch.findMany({ where: { id: branchId } })
        : await prisma.branch.findMany();
      const orders = await prisma.order.findMany({
        where: branchId ? { branchId } : {},
      });

      const summaries = branches.map((branch) => {
        const branchOrders = orders.filter((o) => o.branchId === branch.id);
        const paidOrders = branchOrders.filter((o) => o.status === "Paid");
        const pendingOrders = branchOrders.filter((o) => o.status === "Pending");
        const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
        const averageOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
        return {
          branchId: branch.id,
          branchName: branch.name,
          totalOrders: branchOrders.length,
          totalRevenue,
          paidOrders: paidOrders.length,
          pendingOrders: pendingOrders.length,
          averageOrderValue,
        };
      });

      if (req.user?.role === Roles.BranchManager) {
        res.json(summaries[0] ?? {
          branchId: "", branchName: "—", totalOrders: 0,
          totalRevenue: 0, paidOrders: 0, pendingOrders: 0, averageOrderValue: 0,
        });
      } else {
        res.json(summaries);
      }
    } catch (error) { next(error); }
  }
);

salesRouter.get(
  "/by-branch",
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager),
  async (req, res, next) => {
    try {
      const filterBranchId = req.query.branchId as string | undefined;
      const branches = await prisma.branch.findMany();
      const orders = await prisma.order.findMany({
        where: filterBranchId ? { branchId: filterBranchId } : {},
      });

      const summaries = branches.map((branch) => {
        const branchOrders = orders.filter((o) => o.branchId === branch.id);
        const paidOrders = branchOrders.filter((o) => o.status === "Paid");
        const pendingOrders = branchOrders.filter((o) => o.status === "Pending");
        const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
        const averageOrderValue = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
        return {
          branchId: branch.id,
          branchName: branch.name,
          totalOrders: branchOrders.length,
          totalRevenue,
          paidOrders: paidOrders.length,
          pendingOrders: pendingOrders.length,
          averageOrderValue,
        };
      });

      res.json(summaries);
    } catch (error) { next(error); }
  }
);

// GET /sales/by-branch — revenue and order breakdown per branch for Admin/HQ comparison views
// (already declared above)

// GET /sales/analytics — full analytics data including monthly revenue trend and status breakdown for HQ dashboard
salesRouter.get(
  "/analytics",
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager),
  async (req, res, next) => {
    try {
      const branches = await prisma.branch.findMany();
      const allOrders = await prisma.order.findMany({ orderBy: { createdAt: "asc" } });

      // Build per-branch totals: order counts, revenue, and status breakdown
      const branchSummaries = branches.map((branch) => {
        const branchOrders = allOrders.filter((o) => o.branchId === branch.id);
        const paid = branchOrders.filter((o) => o.status === "Paid");
        const revenue = paid.reduce((sum, o) => sum + Number(o.totalAmount), 0);
        return {
          branchId: branch.id,
          branchName: branch.name,
          totalOrders: branchOrders.length,
          paidOrders: paid.length,
          pendingOrders: branchOrders.filter((o) => o.status === "Pending").length,
          preparingOrders: branchOrders.filter((o) => o.status === "Preparing").length,
          servedOrders: branchOrders.filter((o) => o.status === "Served").length,
          totalRevenue: revenue,
          averageOrderValue: paid.length > 0 ? revenue / paid.length : 0,
        };
      });

      const totalRevenue = branchSummaries.reduce((s, b) => s + b.totalRevenue, 0);
      const totalOrders  = branchSummaries.reduce((s, b) => s + b.totalOrders, 0);
      const totalPaid    = branchSummaries.reduce((s, b) => s + b.paidOrders, 0);
      const topBranch    = branchSummaries.reduce((a, b) => b.totalRevenue > a.totalRevenue ? b : a, branchSummaries[0] ?? { branchId: "", branchName: "—", totalOrders: 0, paidOrders: 0, pendingOrders: 0, preparingOrders: 0, servedOrders: 0, totalRevenue: 0, averageOrderValue: 0 });

      const statusBreakdown = [
        { name: "Pending",   value: allOrders.filter((o) => o.status === "Pending").length   },
        { name: "Preparing", value: allOrders.filter((o) => o.status === "Preparing").length },
        { name: "Served",    value: allOrders.filter((o) => o.status === "Served").length    },
        { name: "Paid",      value: allOrders.filter((o) => o.status === "Paid").length      },
      ];

      const now = new Date();
      // Build last 6 months of paid revenue for the trend chart
      const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
        const monthOrders = allOrders.filter((o) => {
          const od = new Date(o.createdAt);
          return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear() && o.status === "Paid";
        });
        return { month: label, revenue: monthOrders.reduce((s, o) => s + Number(o.totalAmount), 0) };
      });

      res.json({ branchSummaries, totalRevenue, totalOrders, totalPaid, topBranch, statusBreakdown, monthlyRevenue });
    } catch (error) { next(error); }
  }
);

salesRouter.get(
  "/recent",
  requireAuth,
  requireRoles(Roles.Admin, Roles.HQManager, Roles.BranchManager),
  requireBranchScopedUser,
  async (req, res, next) => {
    try {
      const where = req.branchId ? { branchId: req.branchId } : {};
      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      res.json(orders.map(formatOrderResponse));
    } catch (error) { next(error); }
  }
);
