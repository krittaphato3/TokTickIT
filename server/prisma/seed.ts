import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Lab 3 Authentication Foundation seed.
//
// LOCAL-DEVELOPMENT CREDENTIALS ONLY — never use these values outside a dev
// database. Every seeded user starts with mustChangePassword=true (except the
// quota upserts below preserve the flag on re-runs so a developer-changed
// password is not silently reset).
//
//   Role          Email                        Initial password
//   REQUESTER     alpha@toktickit.test         Requester123!
//   REQUESTER     beta@toktickit.test          Requester123!
//   REQUESTER     gamma@toktickit.test         Requester123!
//   REQUESTER     delta@toktickit.test         Requester123!
//   REQUESTER     epsilon@toktickit.test       Requester123!  (inactive)
//   IT_STAFF      sara.it@toktickit.test       Staff123!
//   IT_STAFF      tom.it@toktickit.test        Staff123!
//   IT_STAFF      priya.it@toktickit.test      Staff123!
//   IT_STAFF      leo.it@toktickit.test        Staff123!      (inactive)
//   ADMINISTRATOR admin@toktickit.test         Admin123!
//
// Quotas (spec §7.6): 4 active + 1 inactive REQUESTER, 3 active + 1 inactive
// IT_STAFF, 1 active ADMINISTRATOR. All upserts are keyed on `email`, so the
// seed is idempotent and safe to re-run.
// ---------------------------------------------------------------------------

const BCRYPT_COST = 12;

const REQUESTER_INITIAL_PASSWORD = 'Requester123!';
const STAFF_INITIAL_PASSWORD = 'Staff123!';
const ADMIN_INITIAL_PASSWORD = 'Admin123!';

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

// Quota users (§7.6). Requester quota is covered by REQUESTERS above; the
// lists below cover IT Staff (3 active + 1 inactive) and Administrator (1).
const QUOTA_STAFF: Array<{ name: string; email: string; isActive: boolean }> = [
  { name: 'Sara IT',  email: 'sara.it@toktickit.test',  isActive: true },
  { name: 'Tom IT',   email: 'tom.it@toktickit.test',   isActive: true },
  { name: 'Priya IT', email: 'priya.it@toktickit.test', isActive: true },
  { name: 'Leo IT',   email: 'leo.it@toktickit.test',   isActive: false },
];

const QUOTA_ADMINS: Array<{ name: string; email: string; isActive: boolean }> = [
  { name: 'Ada Admin', email: 'admin@toktickit.test', isActive: true },
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

// ---------------------------------------------------------------------------
// Lab 3: mirror every Requester row into a User row (role REQUESTER) so the
// future Ticket.requesterId repoint can reuse ids. Id is preserved where
// possible; on PK collision with an unrelated User row we fall back to an
// auto id and log the mapping. Existing Tickets are untouched — they still
// reference Requester.requesterId, which stays valid because the Requester
// table is kept (backward compat). The id-preserving mirror means
// User.id === Requester.id for migrated rows, so ownership survives the
// later repoint without a mapping table.
// ---------------------------------------------------------------------------
async function migrateRequestersToUsers(requesterHash: string): Promise<void> {
  const requesters = await prisma.requester.findMany({ orderBy: { id: 'asc' } });
  for (const r of requesters) {
    const email = r.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({
        where: { email },
        data: { name: r.name, isActive: r.isActive },
      });
      if (existing.id !== r.id) {
        console.log(
          `User mirror: Requester id=${r.id} (${email}) already maps to User id=${existing.id}; kept existing User id.`,
        );
      }
      continue;
    }
    try {
      await prisma.user.create({
        data: {
          id: r.id,
          name: r.name,
          email,
          passwordHash: requesterHash,
          role: 'REQUESTER',
          isActive: r.isActive,
          mustChangePassword: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Target (`email`) is unique-checked first above, so a P2002 here is
        // the explicit-id PK colliding with an unrelated User row: fall back
        // to an auto id and log the mapping.
        const created = await prisma.user.create({
          data: {
            name: r.name,
            email,
            passwordHash: requesterHash,
            role: 'REQUESTER',
            isActive: r.isActive,
            mustChangePassword: true,
          },
        });
        console.log(
          `User mirror: Requester id=${r.id} (${email}) collided on User PK; created User id=${created.id} instead.`,
        );
      } else {
        throw error;
      }
    }
  }
}

async function seedQuotaUsers(
  list: Array<{ name: string; email: string; isActive: boolean }>,
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR',
  passwordHash: string,
): Promise<void> {
  for (const u of list) {
    const email = u.email.toLowerCase().trim();
    await prisma.user.upsert({
      where: { email },
      // Never touch passwordHash/mustChangePassword on update: re-running the
      // seed must not reset a developer-changed password.
      update: { name: u.name, role, isActive: u.isActive },
      create: {
        name: u.name,
        email,
        passwordHash,
        role,
        isActive: u.isActive,
        mustChangePassword: true,
      },
    });
  }
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

  // Lab 3 quota users (bcrypt cost 12). One hash per initial password; the
  // same local-dev secret is shared within a role by design.
  const [requesterHash, staffHash, adminHash] = await Promise.all([
    bcrypt.hash(REQUESTER_INITIAL_PASSWORD, BCRYPT_COST),
    bcrypt.hash(STAFF_INITIAL_PASSWORD, BCRYPT_COST),
    bcrypt.hash(ADMIN_INITIAL_PASSWORD, BCRYPT_COST),
  ]);

  // 1. Mirror Requester -> User preserving ids (keeps future repoint trivial).
  await migrateRequestersToUsers(requesterHash);
  // 2. Top up quotas (covers the case of an empty Requester table too).
  await seedQuotaUsers(
    REQUESTERS.map((r) => ({ name: r.name, email: r.email, isActive: r.isActive })),
    'REQUESTER',
    requesterHash,
  );
  await seedQuotaUsers(QUOTA_STAFF, 'IT_STAFF', staffHash);
  await seedQuotaUsers(QUOTA_ADMINS, 'ADMINISTRATOR', adminHash);

  await seedDemoTickets();

  const categoryCount = await prisma.category.count();
  const requesterCount = await prisma.requester.count();
  const systemCount = await prisma.relatedSystem.count();
  const alphaTickets = await prisma.ticket.count({ where: { requesterId: 1 } });
  const activeRequesters = await prisma.user.count({
    where: { role: 'REQUESTER', isActive: true },
  });
  const inactiveRequesters = await prisma.user.count({
    where: { role: 'REQUESTER', isActive: false },
  });
  const activeStaff = await prisma.user.count({
    where: { role: 'IT_STAFF', isActive: true },
  });
  const inactiveStaff = await prisma.user.count({
    where: { role: 'IT_STAFF', isActive: false },
  });
  const activeAdmins = await prisma.user.count({
    where: { role: 'ADMINISTRATOR', isActive: true },
  });
  console.log(
    `Seeded ${categoryCount} categories, ${requesterCount} requesters, ${systemCount} related systems, ${alphaTickets} demo tickets for Dev User Alpha.`,
  );
  console.log(
    `User quotas — REQUESTER active=${activeRequesters}/inactive=${inactiveRequesters}, ` +
      `IT_STAFF active=${activeStaff}/inactive=${inactiveStaff}, ` +
      `ADMINISTRATOR active=${activeAdmins}.`,
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
