import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 12);

  // ── Clean up old Spanish data ──────────────────────────────────────────────
  // Remove outdated menu items and old branch records from a previous version of the app
  await prisma.menuItem.deleteMany({});
  const oldNames = ["Madrid","Barcelona","Seville","Valencia","Bilbao","Manchester","Leeds","Mayfair","London (Mayfair)","Birmingham","Edinburgh"];
  const oldBranches = await prisma.branch.findMany({ where: { name: { in: oldNames } }, select: { id: true } });
  const oldIds = oldBranches.map((b) => b.id);
  if (oldIds.length > 0) {
    await prisma.shift.deleteMany({ where: { branchId: { in: oldIds } } });
    await prisma.review.deleteMany({ where: { branchId: { in: oldIds } } });
    await prisma.reservation.deleteMany({ where: { branchId: { in: oldIds } } });
    await prisma.order.deleteMany({ where: { branchId: { in: oldIds } } });
    await prisma.inventoryItem.deleteMany({ where: { branchId: { in: oldIds } } });
    await prisma.user.deleteMany({ where: { branchId: { in: oldIds } } });
    await prisma.branch.deleteMany({ where: { id: { in: oldIds } } });
  }
  await prisma.user.deleteMany({ where: { role: 8 } });
  console.log("Cleaned up old branches");

  // ── UK Branches ────────────────────────────────────────────────────────────
  // Create or update the 5 Steakz UK branch locations
  const manchester = await prisma.branch.upsert({ where: { name: "Manchester" }, update: {}, create: { name: "Manchester", location: "Manchester, UK" } });
  const london     = await prisma.branch.upsert({ where: { name: "London" },     update: {}, create: { name: "London",     location: "London, UK"     } });
  const edinburgh  = await prisma.branch.upsert({ where: { name: "Edinburgh" },  update: {}, create: { name: "Edinburgh",  location: "Edinburgh, UK"  } });
  const birmingham = await prisma.branch.upsert({ where: { name: "Birmingham" }, update: {}, create: { name: "Birmingham", location: "Birmingham, UK" } });
  const bristol    = await prisma.branch.upsert({ where: { name: "Bristol" },    update: {}, create: { name: "Bristol",    location: "Bristol, UK"    } });

  // Map branch keys to their database records for the staff creation loop below
  const branches = [
    { key: "manchester", record: manchester },
    { key: "london",     record: london     },
    { key: "edinburgh",  record: edinburgh  },
    { key: "birmingham", record: birmingham },
    { key: "bristol",    record: bristol    },
  ];

  const branchStaffNames: Record<string, Record<string, string>> = {
    manchester: { manager: "Manchester Manager", chef: "Manchester Chef", cashier: "Manchester Cashier", waiter: "Manchester Waiter" },
    london:     { manager: "London Manager",     chef: "London Chef",     cashier: "London Cashier",     waiter: "London Waiter"     },
    edinburgh:  { manager: "Edinburgh Manager",  chef: "Edinburgh Chef",  cashier: "Edinburgh Cashier",  waiter: "Edinburgh Waiter"  },
    birmingham: { manager: "Birmingham Manager", chef: "Birmingham Chef", cashier: "Birmingham Cashier", waiter: "Birmingham Waiter" },
    bristol:    { manager: "Bristol Manager",    chef: "Bristol Chef",    cashier: "Bristol Cashier",    waiter: "Bristol Waiter"    },
  };

  const branchRoles = [
    { roleKey: "manager", roleNum: 2, pw: "manager123" },
    { roleKey: "chef",    roleNum: 3, pw: "chef123"    },
    { roleKey: "cashier", roleNum: 4, pw: "cashier123" },
    { roleKey: "waiter",  roleNum: 5, pw: "waiter123"  },
  ];

  for (const { key, record } of branches) {
    for (const { roleKey, roleNum, pw } of branchRoles) {
      const email = `${roleKey}.${key}@steakz.co.uk`;
      const name  = branchStaffNames[key][roleKey];
      await prisma.user.upsert({
        where: { email },
        update: { name, branchId: record.id },
        create: { email, password: await hash(pw), name, role: roleNum, branchId: record.id },
      });
    }
  }

  // ── Global accounts ────────────────────────────────────────────────────────
  // Admin (role 7) and HQ Manager (role 1) are not tied to any branch
  await prisma.user.upsert({ where: { email: "admin@steakz.co.uk" }, update: { name: "Steakz Admin" },  create: { email: "admin@steakz.co.uk", password: await hash("admin123"), name: "Steakz Admin",  role: 7, branchId: null } });
  await prisma.user.upsert({ where: { email: "hq@steakz.co.uk" },    update: { name: "HQ Manager" },    create: { email: "hq@steakz.co.uk",    password: await hash("hq123"),     name: "HQ Manager",    role: 1, branchId: null } });

  // Seed demo customer accounts (role 6) for testing the ordering and review flows
  const customers = [
    { email: "sandra@steakz.co.uk",  name: "Sandra"  },
    { email: "tatenda@steakz.co.uk", name: "Tatenda" },
    { email: "crystal@steakz.co.uk", name: "Crystal" },
  ];
  for (const c of customers) {
    await prisma.user.upsert({ where: { email: c.email }, update: { name: c.name }, create: { email: c.email, password: await hash("123"), name: c.name, role: 6, branchId: null } });
  }

  // ── Inventory ──────────────────────────────────────────────────────────────
  // Seed a small set of branch-specific specialty items with realistic stock levels
  const invData = [
    { itemName: "28-Day Aged Ribeye",      quantity: 12, branchId: manchester.id },
    { itemName: "Bone Marrow",             quantity: 8,  branchId: manchester.id },
    { itemName: "Black Truffle",           quantity: 3,  branchId: london.id     },
    { itemName: "Chateaubriand Fillet",    quantity: 6,  branchId: london.id     },
    { itemName: "Stornoway Black Pudding", quantity: 9,  branchId: edinburgh.id  },
    { itemName: "Tomahawk (1kg)",          quantity: 4,  branchId: birmingham.id },
    { itemName: "Valrhona Chocolate",      quantity: 7,  branchId: bristol.id    },
  ];
  for (const item of invData) {
    const existing = await prisma.inventoryItem.findFirst({ where: { itemName: item.itemName, branchId: item.branchId } });
    const data = { ...item, status: item.quantity <= 4 ? "LowStock" as const : "Normal" as const };
    if (existing) await prisma.inventoryItem.update({ where: { id: existing.id }, data });
    else await prisma.inventoryItem.create({ data });
  }

  // ── Menu ───────────────────────────────────────────────────────────────────
  // Global menu items have branchId: null so they appear at every branch
  const menuData = [
    // STARTERS
    { name: "Bone Marrow & Sourdough",     description: "Roasted bone marrow, parsley salad, sea salt sourdough toast.",               category: "Starters",  price: "8.95",  available: true, branchId: null },
    { name: "Burrata & Heritage Tomatoes", description: "Creamy burrata, heirloom tomatoes, aged balsamic, basil oil.",                category: "Starters",  price: "7.50",  available: true, branchId: null },
    { name: "Potted Beef & Pickles",       description: "Slow-braised beef, house pickles, toasted brioche soldiers.",                 category: "Starters",  price: "6.95",  available: true, branchId: null },
    { name: "Smoked Salmon Rillettes",     description: "House-smoked salmon, crème fraîche, capers, rye crispbread.",                 category: "Starters",  price: "9.50",  available: true, branchId: null },
    { name: "Black Pudding Scotch Egg",    description: "Free-range egg, Stornoway black pudding, mustard aioli.",                     category: "Starters",  price: "7.95",  available: true, branchId: null },
    // STEAKS
    { name: "28-Day Aged Ribeye (300g)",   description: "Dry-aged British ribeye, herb butter, triple-cooked chips.",                  category: "Steaks",    price: "34.95", available: true, branchId: null },
    { name: "Chateaubriand (500g, for 2)", description: "Grass-fed centre fillet, béarnaise sauce, seasonal greens.",                  category: "Steaks",    price: "69.00", available: true, branchId: null },
    { name: "Flat Iron Steak (250g)",      description: "Bavette cut, chimichurri, watercress, shoestring fries.",                     category: "Steaks",    price: "24.95", available: true, branchId: null },
    { name: "Tomahawk (1kg, for 2)",       description: "45-day dry-aged tomahawk, bone-in, sharing sides included.",                  category: "Steaks",    price: "85.00", available: true, branchId: null },
    { name: "Rump & Egg (200g)",           description: "Grass-fed rump, fried hen's egg, beer-battered onion rings.",                 category: "Steaks",    price: "21.95", available: true, branchId: null },
    // SIDES
    { name: "Triple-Cooked Chips",         description: "Goose fat chips, flaky sea salt.",                                            category: "Sides",     price: "4.95",  available: true, branchId: null },
    { name: "Cauliflower Cheese",          description: "Aged cheddar, gruyère, toasted breadcrumbs.",                                 category: "Sides",     price: "5.50",  available: true, branchId: null },
    { name: "Tenderstem Broccoli",         description: "Garlic butter, toasted almonds.",                                             category: "Sides",     price: "4.50",  available: true, branchId: null },
    { name: "Creamed Spinach",             description: "Crème fraîche, nutmeg, parmesan.",                                            category: "Sides",     price: "4.50",  available: true, branchId: null },
    // DESSERTS
    { name: "Sticky Toffee Pudding",       description: "Medjool date sponge, salted caramel toffee sauce, clotted cream.",            category: "Desserts",  price: "7.95",  available: true, branchId: null },
    { name: "Eton Mess Cheesecake",        description: "Strawberry, crushed meringue, vanilla cream cheese.",                         category: "Desserts",  price: "7.50",  available: true, branchId: null },
    { name: "Dark Chocolate Fondant",      description: "Valrhona chocolate, salted caramel centre, honeycomb ice cream.",             category: "Desserts",  price: "8.50",  available: true, branchId: null },
    // DRINKS
    { name: "House Red",                   description: "Malbec, Mendoza, Argentina — full-bodied, notes of plum.",                    category: "Drinks",    price: "6.50",  available: true, branchId: null },
    { name: "Aperol Spritz",               description: "Aperol, Prosecco, fresh orange.",                                             category: "Drinks",    price: "8.95",  available: true, branchId: null },
    { name: "Classic Negroni",             description: "Tanqueray gin, Campari, sweet vermouth, orange zest.",                        category: "Drinks",    price: "9.50",  available: true, branchId: null },
    { name: "Soft Drinks",                 description: "Coke, Diet Coke, lemonade, sparkling water.",                                 category: "Drinks",    price: "2.95",  available: true, branchId: null },
    // LONDON SPECIAL
    { name: "Mayfair Wagyu Sirloin",       description: "A5 Wagyu sirloin, truffle butter, potato gratin. London exclusive.",          category: "Specials",  price: "95.00", available: true, branchId: london.id },
  ];

  for (const item of menuData) {
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name, branchId: item.branchId ?? null } });
    if (existing) await prisma.menuItem.update({ where: { id: existing.id }, data: item });
    else await prisma.menuItem.create({ data: item });
  }

  // ── Reset all inventory to qty 5 ──────────────────────────────────────────
  // Wipe and rebuild inventory so every branch starts with a clean, equal stock level
  console.log("Resetting all inventory to qty 5...");
  await prisma.inventoryItem.deleteMany({});
  const allBranches = await prisma.branch.findMany();
  const allMenuItems = await prisma.menuItem.findMany();
  for (const branch of allBranches) {
    // Each branch gets rows for its own items plus all global items
    const branchItems = allMenuItems.filter(
      (m) => m.branchId === branch.id || m.branchId === null
    );
    for (const item of branchItems) {
      await prisma.inventoryItem.create({
        data: { itemName: item.name, quantity: 5, status: "Normal", branchId: branch.id },
      });
    }
  }
  // Mark every menu item as available now that stock has been reset
  await prisma.menuItem.updateMany({ where: {}, data: { available: true } });
  console.log("Inventory reset complete.");

  console.log("\n=== STEAKZ UK — LOGIN CREDENTIALS ===");
  console.log("GLOBAL:");
  console.log("  Admin (7):       admin@steakz.co.uk        / admin123");
  console.log("  HQ Manager (1):  hq@steakz.co.uk           / hq123");
  console.log("  Customers (6):   sandra/tatenda/crystal @steakz.co.uk  / 123");
  console.log("\nBRANCH STAFF:");
  for (const { key } of branches) {
    console.log(`\n  ${key.toUpperCase()}:`);
    for (const { roleKey, pw } of branchRoles) {
      console.log(`    ${roleKey.padEnd(9)}: ${roleKey}.${key}@steakz.co.uk`.padEnd(50) + ` / ${pw}`);
    }
  }
  console.log("\n=====================================\n");
  console.log("Seeding complete. 5 UK branches: Manchester, London, Edinburgh, Birmingham, Bristol");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
