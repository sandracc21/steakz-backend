import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, requireRoles } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { Roles } from "../types/roles";

export const reviewsRouter = Router();

// GET /reviews/public — latest 4-5 star reviews for homepage (no auth)
reviewsRouter.get("/public", async (_req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { rating: { gte: 4 } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { branch: { select: { name: true } } },
    });
    res.json(reviews);
  } catch (error) { next(error); }
});

// GET /reviews/stats — aggregate average and count (no auth)
reviewsRouter.get("/stats", async (_req, res, next) => {
  try {
    const result = await prisma.review.aggregate({
      _avg: { rating: true },
      _count: { id: true },
    });
    res.json({
      average: result._avg.rating ? Number(result._avg.rating.toFixed(1)) : 0,
      count: result._count.id,
    });
  } catch (error) { next(error); }
});

// POST /reviews — customer submits a review for a completed order
reviewsRouter.post(
  "/",
  requireAuth,
  requireRoles(Roles.Customer),
  async (req, res, next) => {
    try {
      const { orderId, rating, comment } = req.body as {
        orderId?: string;
        rating?: number;
        comment?: string;
      };

      if (!orderId || !rating) throw new ApiError(400, "orderId and rating are required");
      if (rating < 1 || rating > 5) throw new ApiError(400, "Rating must be between 1 and 5");

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) throw new ApiError(404, "Order not found");
      // Only Paid orders can be reviewed — ensures the customer actually received their food
      if (order.status !== "Paid") throw new ApiError(400, "You can only review a completed (Paid) order");

      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) throw new ApiError(404, "User not found");
      // Confirm the order was placed under the same customer name as the logged-in user
      if (order.customerName?.toLowerCase() !== user.name.toLowerCase()) {
        throw new ApiError(403, "This order does not belong to your account");
      }

      // Enforce one review per order — orderId is unique in the Review table
      const existing = await prisma.review.findUnique({ where: { orderId } });
      if (existing) throw new ApiError(409, "You have already reviewed this order");

      const review = await prisma.review.create({
        data: {
          orderId,
          customerName: user.name,
          rating,
          comment: comment?.trim() || null,
          branchId: order.branchId,
        },
      });
      res.status(201).json(review);
    } catch (error) { next(error); }
  }
);
