import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';

// PATCH /api/admin/users/[id] — freeze/unfreeze, change role, reset password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json();
    const { frozen, role, password } = body;

    const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (typeof frozen === 'boolean') updateData.frozen = frozen;
    if (role && ['admin', 'user'].includes(role)) updateData.role = role;

    // If freezing or changing role, bump sessionVersion to force re-login
    if (typeof frozen === 'boolean' || role) {
      updateData.sessionVersion = { increment: 1 };
    }

    // Password reset
    if (password) {
      const bcrypt = await import('bcryptjs');
      updateData.passwordHash = await bcrypt.hash(password, 12);
      updateData.sessionVersion = { increment: 1 };
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, frozen: true, sessionVersion: true, createdAt: true, updatedAt: true },
    });

    const action = frozen === true ? 'admin:freeze_user' : frozen === false ? 'admin:unfreeze_user' : password ? 'admin:reset_password' : 'admin:update_user';
    await db.auditLog.create({
      data: { userId: admin.userId, action, resource: 'User', detail: JSON.stringify({ targetId: id, targetEmail: user.email, changes: Object.keys(body) }), ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Admin update user error:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id] — delete user
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Prevent self-deletion
    if (id === admin.userId) return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });

    await db.user.delete({ where: { id } });

    await db.auditLog.create({
      data: { userId: admin.userId, action: 'admin:delete_user', resource: 'User', detail: JSON.stringify({ targetId: id, targetEmail: user.email }), ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null },
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error('Admin delete user error:', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
