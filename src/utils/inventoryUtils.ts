import { prisma } from "../prisma";

export async function seedInventoryForAllBranches() {
  const branches = await prisma.branch.findMany();
  for (const branch of branches) {
    const menuItems = await prisma.menuItem.findMany({
      where: { OR: [{ branchId: branch.id }, { branchId: null }] },
    });
    for (const item of menuItems) {
      const existing = await prisma.inventoryItem.findFirst({
        where: { branchId: branch.id, itemName: item.name },
      });
      if (!existing) {
        await prisma.inventoryItem.create({
          data: { itemName: item.name, quantity: 5, status: "Normal", branchId: branch.id },
        });
      }
    }
  }
}
