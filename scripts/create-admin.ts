import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@openjarvis.ai';
  const password = 'JARVIS_Admin_2026!Secure';
  
  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin user already exists, updating role...');
    await prisma.user.update({
      where: { email },
      data: { role: 'admin' },
    });
    console.log('Admin role updated.');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    return;
  }

  // Create admin
  const hash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: {
      name: 'Admin',
      email,
      passwordHash: hash,
      role: 'admin',
      frozen: false,
      sessionVersion: 0,
    },
  });

  console.log('Admin account created successfully!');
  console.log(`ID: ${admin.id}`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
