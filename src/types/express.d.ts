import type { AuthUser } from "./roles";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      branchId?: string;
    }
  }
}

export {};
