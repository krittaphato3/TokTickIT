import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Account and Access' },
  { name: 'Hardware' },
  { name: 'Software' },
  { name: 'Network' },
];

const REQUESTERS = [
  { id: 1, name: 'Dev User Alpha', email: 'alpha@toktickit.test', isActive: true },
  { id: 2, name: 'Dev User Beta',  email: 'beta@toktickit.test',  isActive: true },
  { id: 3, name: 'Dev User Gamma', email: 'gamma@toktickit.test', isActive: true },
  { id: 4, name: 'Dev User Delta', email: 'delta@toktickit.test', isActive: true },
  { id: 5, name: 'Dev User Epsilon', email: 'epsilon@toktickit.test', isActive: false },
];

const RELATED_SYSTEMS = [
  'Email Server',
  'VPN Gateway',
  'Printer',
  'Database Server',
  'File Server',
  'Active Directory',
  'Web Application',
];

async function main(): Promise<void> {
  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
  }

  for (const requester of REQUESTERS) {
    await prisma.requester.upsert({
      where: { email: requester.email },
      update: { name: requester.name, isActive: requester.isActive },
      create: requester,
    });
  }

  for (const name of RELATED_SYSTEMS) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const categoryCount = await prisma.category.count();
  const requesterCount = await prisma.requester.count();
  const systemCount = await prisma.relatedSystem.count();
  console.log(
    `Seeded ${categoryCount} categories, ${requesterCount} requesters, ${systemCount} related systems.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
