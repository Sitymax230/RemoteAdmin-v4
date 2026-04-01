import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (isNaN(limit) || isNaN(offset) || limit < 1 || offset < 0) {
      return NextResponse.json(
        { error: 'Invalid limit or offset' },
        { status: 400 }
      );
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        take: Math.min(limit, 200),
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              role: true,
            },
          },
        },
      }),
      db.auditLog.count(),
    ]);

    return NextResponse.json({
      data: logs,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('List audit logs error:', error);
    return NextResponse.json(
      { error: 'Failed to list audit logs' },
      { status: 500 }
    );
  }
}
