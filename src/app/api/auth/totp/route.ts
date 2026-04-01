import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyTOTP } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code } = body;

    if (!userId || !code) {
      return NextResponse.json({ error: 'User ID and TOTP code are required' }, { status: 400 });
    }

    const user = await db.adminUser.findUnique({ where: { id: userId } });
    if (!user || !user.totpSecret) {
      return NextResponse.json({ error: 'User not found or TOTP not configured' }, { status: 404 });
    }

    // Check regular TOTP code
    const isValid = verifyTOTP(user.totpSecret, code);

    // Check backup codes if TOTP is invalid
    let usedBackupCode = false;
    if (!isValid && user.backupCodes) {
      try {
        const codes: string[] = JSON.parse(user.backupCodes);
        const idx = codes.indexOf(code.toUpperCase());
        if (idx !== -1) {
          codes.splice(idx, 1);
          await db.adminUser.update({
            where: { id: userId },
            data: { backupCodes: JSON.stringify(codes) },
          });
          usedBackupCode = true;
        }
      } catch { /* ignore parse errors */ }
    }

    if (!isValid && !usedBackupCode) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'totp_verification_failed',
          detail: 'Invalid TOTP code provided',
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        },
      });
      return NextResponse.json({ error: 'Invalid TOTP code' }, { status: 401 });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'totp_verification_success',
        detail: usedBackupCode ? 'Login via backup code' : '2FA verification successful',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      },
    });

    return NextResponse.json({
      success: true,
      usedBackupCode,
      remainingBackupCodes: user.backupCodes ? JSON.parse(user.backupCodes).length - (usedBackupCode ? 1 : 0) : 0,
      token: `session_${user.id}`,
      userId: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    console.error('TOTP verification error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
