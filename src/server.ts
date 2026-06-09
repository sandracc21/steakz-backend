import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import morgan from "morgan";
import { adminRouter } from "./routes/admin.routes";
import { authRouter } from "./routes/auth.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { menuRouter } from "./routes/menu.routes";
import { ordersRouter } from "./routes/orders.routes";
import { publicRouter } from "./routes/public.routes";
import { salesRouter } from "./routes/sales.routes";
import { shiftsRouter } from "./routes/shifts.routes";
import { hqRouter } from "./routes/hq.routes";
import { reservationsRouter } from "./routes/reservations.routes";
import { reviewsRouter } from "./routes/reviews.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { seedInventoryForAllBranches } from "./utils/inventoryUtils";

// Load environment variables from .env file
dotenv.config();

const app = express();
// Use PORT from environment so it works in both dev and production
const port = Number(process.env.PORT ?? 4000);

// Allow requests from localhost in dev and Vercel in production
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "https://steakz-frontend-mu.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

// Allow cross-origin requests from the frontend and include cookies/auth headers
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}));
// Parse incoming JSON request bodies (max 1mb to avoid oversized payloads)
app.use(express.json({ limit: "1mb" }));
// Log every incoming request to the console for debugging
app.use(morgan("dev"));

// Simple health-check endpoint so servers/monitors can confirm the API is running
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "steakz-mis-api" });
});

// Route groups — each handles a specific area of the app
app.use("/auth", authRouter);           // Login and registration
app.use("/admin", adminRouter);         // Admin-only branch and user management
app.use("/hq", hqRouter);              // HQ manager views
app.use("/orders", ordersRouter);       // Order creation and status updates
app.use("/public", publicRouter);       // Publicly accessible menu and branch data
app.use("/inventory", inventoryRouter); // Inventory tracking per branch
app.use("/shifts", shiftsRouter);       // Staff shift scheduling
app.use("/sales", salesRouter);         // Sales analytics and revenue summaries
app.use("/menu", menuRouter);           // Menu item management
app.use("/reservations", reservationsRouter); // Table reservations
app.use("/reviews", reviewsRouter);     // Customer reviews

// Mirror routes under /api/ prefix for frontend compatibility
app.use("/api/reservations", reservationsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/hq", hqRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/public", publicRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/menu", menuRouter);

// Catch unmatched routes and format all errors consistently
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Steakz MIS API listening on port ${port}`);
  // Ensure every branch has inventory rows on startup
  seedInventoryForAllBranches().catch(console.error);
});