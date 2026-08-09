import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function generateCustomerNumber(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await prisma.member.findUnique({ where: { customerNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Konnte keine eindeutige Kundennummer erzeugen.");
}

const SAMPLE_ITEMS = [
  {
    name: "Netherite-Rüstung (Set)",
    category: "Rüstung",
    description: "Vollständiges Netherite-Rüstungsset, unverzaubert.",
    averagePrice: 2_500_000,
    quantityTotal: 3,
    imageUrl: "https://placehold.co/600x400/0d1220/f2b544?text=Netherite-R%C3%BCstung",
    sourceUrl: "https://opsucht.net",
  },
  {
    name: "Elytra",
    category: "Fortbewegung",
    description: "Elytra ohne Verzauberungen, aus dem End-Schiff.",
    averagePrice: 1_800_000,
    quantityTotal: 2,
    imageUrl: "https://placehold.co/600x400/0d1220/3ddc97?text=Elytra",
    sourceUrl: "https://opsucht.net",
  },
  {
    name: "Diamant-Schwert (Scharfe V)",
    category: "Waffen",
    description: "Diamantschwert mit Scharfe V und Feueraspekt II.",
    averagePrice: 650_000,
    quantityTotal: 5,
    imageUrl: "https://placehold.co/600x400/0d1220/f2b544?text=Diamantschwert",
    sourceUrl: "https://opsucht.net",
  },
  {
    name: "Shulker-Box",
    category: "Lagerung",
    description: "Leere Shulker-Box zum Transport.",
    averagePrice: 120_000,
    quantityTotal: 10,
    imageUrl: "https://placehold.co/600x400/0d1220/3ddc97?text=Shulker-Box",
    sourceUrl: "https://opsucht.net",
  },
];

async function main() {
  console.log("Seed: lege Beispiel-Items an...");
  for (const { category, ...item } of SAMPLE_ITEMS) {
    const existing = await prisma.item.findFirst({ where: { name: item.name } });
    if (!existing) {
      const categoryRow = await prisma.category.upsert({
        where: { name: category },
        update: {},
        create: { name: category },
      });
      await prisma.item.create({
        data: { ...item, categoryId: categoryRow.id, priceStatus: "MANUAL" },
      });
    }
  }

  console.log("Seed: lege Beispiel-Mitglieder an...");
  const owner = await prisma.member.upsert({
    where: { discordId: "seed-owner-000000000000000" },
    update: {},
    create: {
      discordId: "seed-owner-000000000000000",
      username: "owner_beispiel",
      displayName: "Owner (Beispiel)",
      minecraftName: "OwnerCraft",
      role: "OWNER",
      status: "ACTIVE",
      customerNumber: await generateCustomerNumber(),
    },
  });

  const aufsicht = await prisma.member.upsert({
    where: { discordId: "seed-aufsicht-000000000000" },
    update: {},
    create: {
      discordId: "seed-aufsicht-000000000000",
      username: "aufsicht_beispiel",
      displayName: "Aufsicht (Beispiel)",
      minecraftName: "AufsichtCraft",
      role: "AUFSICHT",
      status: "ACTIVE",
      customerNumber: await generateCustomerNumber(),
    },
  });

  const kunde = await prisma.member.upsert({
    where: { discordId: "seed-kunde-0000000000000000" },
    update: {},
    create: {
      discordId: "seed-kunde-0000000000000000",
      username: "kunde_beispiel",
      displayName: "Kunde (Beispiel)",
      minecraftName: "KundeCraft",
      role: "KUNDE",
      status: "ACTIVE",
      customerNumber: await generateCustomerNumber(),
    },
  });

  const firstItem = await prisma.item.findFirst({ where: { name: SAMPLE_ITEMS[0].name } });
  if (firstItem) {
    const hasLoan = await prisma.loan.findFirst({ where: { memberId: kunde.id, itemId: firstItem.id } });
    if (!hasLoan) {
      await prisma.loan.create({
        data: { itemId: firstItem.id, memberId: kunde.id, channel: "WEB", status: "ACTIVE" },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: owner.id,
      targetId: aufsicht.id,
      action: "SEED_DATA_CREATED",
      details: "Beispieldaten für die lokale Entwicklung angelegt.",
    },
  });

  console.log("Seed abgeschlossen.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
