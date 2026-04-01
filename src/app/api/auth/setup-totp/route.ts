import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTOTPSecret, verifyTOTP, generateTOTPURI } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const secret = generateTOTPSecret();
    const uri = generateTOTPURI(user.username, secret);

    await db.adminUser.update({
      where: { id: userId },
      data: { totpSecret: secret },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'totp_setup_initiated',
        detail: 'TOTP secret generated, awaiting verification',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      },
    });

    return NextResponse.json({
      secret,
      uri,
    });
  } catch (error) {
    console.error('TOTP setup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
        { error: 'User not found or TOTP secret not generated' },
        { status: 404 }
      );
    }

    const isValid = verifyTOTP(user.totpSecret, code);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid TOTP code' },
        { status: 401 }
      );
    }

    await db.adminUser.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'totp_setup_completed',
        detail: 'Two-factor authentication enabled',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Two-factor authentication has been enabled',
    });
  } catch (error) {
    console.error('TOTP enable error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
