import { createDecipheriv } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.VAULT_ENCRYPTION_KEY || 'fallback-vault-key-32-bytes-long!';
  return Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    const entry = await db.vaultEntry.findUnique({ where: { key } });
    if (!entry) return NextResponse.json({ error: 'Secret not found' }, { status: 404 });

    const encKey = getEncryptionKey();
    const iv = Buffer.from(entry.iv, 'hex');
    const tag = Buffer.from(entry.tag, 'hex');
    const decipher = createDecipheriv(ALGORITHM, encKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(entry.value, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return NextResponse.json({ key: entry.key, value: decrypted, createdAt: entry.createdAt });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to decrypt secret' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    await db.vaultEntry.delete({ where: { key } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete secret' }, { status: 500 });
  }
}
