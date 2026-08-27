import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

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

// ---------------------------------------------------------------------------
// Issue #30 — My Tickets v2 demo data. Idempotent: demo rows live in a
// dedicated TTK-2026-8xxxxx band (the ticket_number_seq band is 0xxxxx and
// the test fixtures use 9xxxxx), so re-running deletes + recreates exactly
// the demo set inside one transaction without touching real tickets.
// ---------------------------------------------------------------------------

const DEMO_TICKET_NUMBER_BASE = 800000;

const OWNER_POOL = [
  'Michael Brown',
  'Sarah Johnson',
  'David Lee',
  'Jennifer Anderson',
] as const;

const DEMO_STATUSES = [
  'NEW',
  'OPEN',
  'PENDING',
  'IN_PROGRESS',
  'RESOLVED',
] as const;

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const DEMO_SUMMARIES = [
  ['Laptop battery drains quickly', 'Hardware'],
  ['Cannot connect to VPN', 'Network'],
  ['Email not syncing on mobile', 'Software'],
  ['New employee setup request', 'Account and Access'],
  ['Printer keeps showing offline', 'Hardware'],
  ['Request access to SharePoint', 'Account and Access'],
  ['Outlook freezing intermittently', 'Software'],
  ['Docking station not detected', 'Hardware'],
  ['Wi-Fi drops in conference room B', 'Network'],
  ['Password reset email not arriving', 'Account and Access'],
  ['Excel crashes on large files', 'Software'],
  ['Monitor flickering at desk 4F-12', 'Hardware'],
  ['Cannot access shared drive', 'Network'],
  ['Request license for design tool', 'Software'],
  ["Laptop won't charge past 80%", 'Hardware'],
  ['Account locked after password change', 'Account and Access'],
  ['Teams audio cuts out during calls', 'Network'],
  ['Install antivirus on new workstation', 'Software'],
  ['Keyboard keys sticking', 'Hardware'],
  ['VPN slow when accessing ERP', 'Network'],
  ['Email quarantine false positives', 'Software'],
  ['Badge reader not recognizing card', 'Account and Access'],
  ['Projector shows no signal', 'Hardware'],
  ['Cannot join wireless from phone', 'Network'],
  ['Outlook rules not applying', 'Software'],
  ['Request admin rights for dev machine', 'Account and Access'],
  ['Second monitor not detected', 'Hardware'],
  ['Guest Wi-Fi portal stuck on loading', 'Network'],
  ['PDF editor license expired', 'Software'],
  ['Shared mailbox access request', 'Account and Access'],
  ['Laptop overheats during video calls', 'Hardware'],
  ['Intermittent DNS resolution failures', 'Network'],
  ['OneDrive sync paused randomly', 'Software'],
  ['Password expiring too often', 'Account and Access'],
  ['USB-C hub ports failing', 'Hardware'],
  ['Cannot reach intranet site', 'Network'],
  ['Browser keeps forgetting session', 'Software'],
  ['New starter account provisioning', 'Account and Access'],
  ['Headset microphone not working', 'Hardware'],
  ['Video conferencing room echo', 'Network'],
  ['Spreadsheet macros blocked', 'Software'],
  ['Access request for finance folder', 'Account and Access'],
] as const;

// Deterministic pseudo-random pick so every seed run produces identical data.
function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length];
}

async function seedDemoTickets(): Promise<void> {
  const categories = await prisma.category.findMany();
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));
  const systems = await prisma.relatedSystem.findMany();
  if (systems.length === 0 || categories.length === 0) {
    throw new Error('Categories/related systems must be seeded before demo tickets');
  }

  // Alpha must end up with exactly 42 tickets (pageSize 10 -> 5 pages); the
  // other requesters get ~10 each.
  const plans: Array<{ requesterId: number; count: number }> = [
    { requesterId: 1, count: 42 },
    { requesterId: 2, count: 10 },
    { requesterId: 3, count: 10 },
    { requesterId: 4, count: 10 },
  ];

  await prisma.$transaction(async (tx) => {
    // Idempotency: wipe the dedicated demo band AND any stray tickets the
    // dev-fixture requesters accumulated from manual testing, so every seed
    // run converges to the exact per-requester counts below.
    await tx.ticket.deleteMany({
      where: { requesterId: { in: plans.map((p) => p.requesterId) } },
    });
    await tx.ticket.deleteMany({
      where: {
        ticketNumber: {
          gte: `TTK-2026-${String(DEMO_TICKET_NUMBER_BASE).padStart(6, '0')}`,
          lt: `TTK-2026-${String(DEMO_TICKET_NUMBER_BASE + 100000).padStart(6, '0')}`,
        },
      },
    });

    let n = 0;
    for (const plan of plans) {
      for (let i = 0; i < plan.count; i += 1) {
        const [summary, categoryName] = pick(DEMO_SUMMARIES, n);
        const status = pick(DEMO_STATUSES, Math.floor(n / 3));
        const priority = pick(PRIORITIES, Math.floor(n / 2));
        // IT priority sometimes equals the requested one, sometimes differs,
        // sometimes is unset.
        const itPriority =
          n % 7 === 0 ? null : n % 3 === 0 ? priority : pick(PRIORITIES, n + 1);
        const ownerName = n % 9 === 0 ? null : pick(OWNER_POOL, n);

        await tx.ticket.create({
          data: {
            ticketNumber: `TTK-2026-${String(DEMO_TICKET_NUMBER_BASE + n).padStart(6, '0')}`,
            title: summary,
            description: `Demo ticket ${n + 1} for My Tickets v2 — ${summary.toLowerCase()}.`,
            status,
            priority,
            ...(itPriority === null ? {} : { itPriority }),
            ownerName,
            requesterId: plan.requesterId,
            categoryId: categoryByName.get(categoryName)!,
            relatedSystemId: pick(systems, n).id,
            createdAt: new Date(Date.now() - (n + 1) * 3600 * 1000),
          },
        });
        n += 1;
      }
    }
  });
}

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

  await seedDemoTickets();

  const categoryCount = await prisma.category.count();
  const requesterCount = await prisma.requester.count();
  const systemCount = await prisma.relatedSystem.count();
  const alphaTickets = await prisma.ticket.count({ where: { requesterId: 1 } });
  console.log(
    `Seeded ${categoryCount} categories, ${requesterCount} requesters, ${systemCount} related systems, ${alphaTickets} demo tickets for Dev User Alpha.`,
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
