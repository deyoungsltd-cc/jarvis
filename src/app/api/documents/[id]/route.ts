import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unlink } from 'fs/promises';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    await db.document.delete({ where: { id } });
    // Best-effort file deletion
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir('/home/z/my-project/upload');
      const match = files.find((f) => f.endsWith(doc.filename));
      if (match) await unlink(`/home/z/my-project/upload/${match}`);
    } catch {
      // File may not exist
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
