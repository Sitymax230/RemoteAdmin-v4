import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const user = await db.adminUser.findUnique({
      where: { username },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isValid = verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Create audit log for login attempt
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'login_attempt',
        detail: user.totpEnabled ? 'Login requires 2FA verification' : 'Login successful',
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      },
    });

    if (user.totpEnabled && user.totpSecret) {
      return NextResponse.json({
        requires2FA: true,
        userId: user.id,
        username: user.username,
        role: user.role,
        totpEnabled: true,
      });
    }

    return NextResponse.json({
      requires2FA: false,
      userId: user.id,
      username: user.username,
      role: user.role,
      totpEnabled: user.totpEnabled,
      token: `session_${user.id}`,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
