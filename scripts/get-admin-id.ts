import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@openjarvis.ai' } });
  if (!admin) { console.log('Admin not found'); return; }
  console.log('Admin ID:', admin.id);

  // Generate 5 invite keys
  for (let i = 0; i < 5; i++) {
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    await prisma.inviteKey.create({
      data: {
        code,
        createdBy: admin.id,
        maxUses: 10,
        active: true,
      },
    });
    console.log(`Key ${i + 1}: ${code}`);
  }
  console.log('Done! 5 invite keys created.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
