import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. List all invite keys in DB
  const keys = await prisma.inviteKey.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('=== ALL INVITE KEYS IN DB ===');
  for (const k of keys) {
    console.log({
      id: k.id,
      code: k.code,
      active: k.active,
      maxUses: k.maxUses,
      useCount: k.useCount,
      usedBy: k.usedBy,
      expiresAt: k.expiresAt,
    });
  }

  // 2. Test lookup by exact code
  if (keys.length > 0) {
    const testCode = keys[0].code;
    console.log(`\n=== TESTING LOOKUP FOR: "${testCode}" ===`);
    const found = await prisma.inviteKey.findUnique({ where: { code: testCode } });
    console.log('findUnique result:', found ? 'FOUND' : 'NOT FOUND');

    // Test with lowercase
    const foundLower = await prisma.inviteKey.findUnique({ where: { code: testCode.toLowerCase() } });
    console.log('findUnique (lowercase):', foundLower ? 'FOUND' : 'NOT FOUND');
  }

  // 3. List all users
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, frozen: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  console.log('\n=== ALL USERS ===');
  for (const u of users) {
    console.log(u);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
