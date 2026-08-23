import { createCipheriv, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.VAULT_ENCRYPTION_KEY || 'fallback-vault-key-32-bytes-long!';
  return Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');
}

export async function GET() {
  try {
    const entries = await db.vaultEntry.findMany({ orderBy: { createdAt: 'desc' } });
    const masked = entries.map((e) => ({ ...e, value: '***' }));
    return NextResponse.json(masked);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch vault entries' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.key || body.value === undefined) {
      return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
    }

    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(String(body.value), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    const entry = await db.vaultEntry.create({
      data: {
        key: body.key,
        value: encrypted,
        iv: iv.toString('hex'),
        tag,
      },
    });

    return NextResponse.json({ ...entry, value: '***' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to store secret' }, { status: 500 });
  }
}
