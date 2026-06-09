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

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
];

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
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "steakz-mis-api" });
});

app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/hq", hqRouter);
app.use("/orders", ordersRouter);
app.use("/public", publicRouter);
app.use("/inventory", inventoryRouter);
app.use("/shifts", shiftsRouter);
app.use("/sales", salesRouter);
app.use("/menu", menuRouter);
app.use("/reservations", reservationsRouter);
app.use("/reviews", reviewsRouter);

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

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Steakz MIS API listening on port ${port}`);
  seedInventoryForAllBranches().catch(console.error);
});
