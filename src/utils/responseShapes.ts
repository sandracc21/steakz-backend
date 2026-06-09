import type { Prisma } from "@prisma/client";

type OrderResponse = Prisma.OrderGetPayload<object>;
type MenuItemResponse = Prisma.MenuItemGetPayload<object>;

export const formatOrderResponse = (order: OrderResponse) => ({
  ...order,
  totalAmount: Number(order.totalAmount),
});

export const formatOrderResponses = (orders: OrderResponse[]) => orders.map(formatOrderResponse);

export const formatMenuItemResponse = (item: MenuItemResponse) => ({
  ...item,
  price: Number(item.price),
});

export const formatMenuItemResponses = (items: MenuItemResponse[]) => items.map(formatMenuItemResponse);
