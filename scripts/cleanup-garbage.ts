import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Delete the garbage user created by the old validation flow
  const garbage = await prisma.user.findUnique({ where: { email: '_validate_only@check.com' } });
  if (garbage) {
    console.log('Found garbage user:', garbage.id);
    // Reset invite key usedBy if it points to this user
    await prisma.inviteKey.updateMany({ where: { usedBy: garbage.id }, data: { usedBy: null, useCount: { decrement: 1 } } });
    // Delete the garbage user
    await prisma.user.delete({ where: { id: garbage.id } });
    console.log('Garbage user deleted.');
  } else {
    console.log('No garbage user found.');
  }

  // Also reset any invite keys that may have had their useCount inflated
  const keys = await prisma.inviteKey.findMany({ where: { useCount: { gt: 0 } } });
  for (const k of keys) {
    const realUsers = await prisma.user.count({ where: { id: k.usedBy || 'none' } });
    if (!k.usedBy || realUsers === 0) {
      await prisma.inviteKey.update({ where: { id: k.id }, data: { useCount: 0, usedBy: null } });
      console.log(`Reset key ${k.code} useCount to 0`);
    }
  }

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
