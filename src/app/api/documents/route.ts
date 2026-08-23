import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const documents = await db.document.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(documents);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `${Date.now()}-${file.name}`;
    const uploadDir = '/home/z/my-project/upload';
    const filepath = join(uploadDir, filename);

    await writeFile(filepath, buffer);

    const document = await db.document.create({
      data: {
        filename: file.name,
        contentType: file.type,
        size: file.size,
      },
    });

    return NextResponse.json({ ...document, filepath }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}
