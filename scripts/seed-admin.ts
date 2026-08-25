/**
 * Seed Admin Script
 * 
 * Run this ONCE to create the initial admin account.
 * After that, use the /admin panel to manage users.
 * 
 * Usage (from project root):
 *   DATABASE_URL=your_connection_string npx tsx scripts/seed-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@openjarvis.ai';
  const password = process.env.ADMIN_PASSWORD || generatePassword();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin already exists:', email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await db.user.create({
    data: { name: 'Admin', email, passwordHash, role: 'admin' },
  });

  const masterKey = process.env.INVITE_KEY;
  if (masterKey) {
    try {
      await db.inviteKey.create({
        data: { code: masterKey, createdBy: admin.id, maxUses: 1000, active: true },
      });
      console.log('Master invite key seeded:', masterKey);
    } catch (e: any) {
      if (e.code === 'P2002') console.log('Master invite key already exists');
      else throw e;
    }
  }

  console.log('\n===========================================');
  console.log('  ADMIN ACCOUNT CREATED');
  console.log('===========================================');
  console.log('  Email:    ' + email);
  console.log('  Password: ' + password);
  console.log('===========================================');
  console.log('\nSave these credentials NOW.\n');
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 16; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
