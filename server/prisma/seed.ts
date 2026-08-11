import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The four supported request categories required by Lab 1.
const CATEGORIES = ['Account and Access', 'Hardware', 'Software', 'Network'];

async function main(): Promise<void> {
  // Upsert keyed on the unique name keeps this idempotent: re-running the
  // seed updates existing rows instead of creating duplicates.
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const count = await prisma.category.count();
  console.log(`Seeded ${CATEGORIES.length} categories. Total categories: ${count}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
