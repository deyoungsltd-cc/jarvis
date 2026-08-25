import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete test users created during testing
  const deleted = await prisma.user.deleteMany({
    where: { email: { in: ['testuser@example.com', 'testuser2@example.com', 'bad@example.com'] } },
  });
  console.log(`Deleted ${deleted.count} test users`);

  // Reset key use count for the test key
  await prisma.inviteKey.updateMany({
    where: { code: '82011D70A4DF6C5B' },
    data: { useCount: 0, usedBy: null },
  });
  console.log('Reset test key use count');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
