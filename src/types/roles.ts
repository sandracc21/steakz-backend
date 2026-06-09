export const Roles = {
  OpenArea: 0,
  HQManager: 1,
  BranchManager: 2,
  Chef: 3,
  Cashier: 4,
  Waiter: 5,
  Customer: 6,
  Admin: 7,
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export interface AuthUser {
  userId: string;
  role: Role;
  branchId: string | null;
}

export interface JwtPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

export const isRole = (value: number): value is Role =>
  Object.values(Roles).includes(value as Role);
