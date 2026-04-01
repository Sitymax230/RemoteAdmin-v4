import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyTOTP } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code } = body;

    if (!userId || !code) {
      return NextResponse.json(
        { error: 'User ID and TOTP code are required' },
        { status: 400 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { id: userId },
    });

    if (!user || !user.totpSecret) {
      return NextResponse.json(
        { error: 'User not found or TOTP not configured' },
        { status: 404 }
      );
    }

    const isValid = verifyTOTP(user.totpSecret, code);

    if (!isValid) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'totp_verification_failed',
          detail: 'Invalid TOTP code provided',
          ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        },
      });

      return NextResponse.json(
        { error: 'Invalid TOTP code' },
        { status: 401 }
      );
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'totp_verification_success',
        detail: '2FA verification successful',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      },
    });

    return NextResponse.json({
      success: true,
      token: `session_${user.id}`,
      userId: user.id,
      username: user.username,
      role: user.role,
    });
  } catch (error) {
    console.error('TOTP verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
