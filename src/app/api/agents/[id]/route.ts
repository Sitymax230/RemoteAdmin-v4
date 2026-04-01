import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const agent = await db.agent.findUnique({
      where: { id },
      include: {
        metrics: {
          orderBy: { timestamp: 'desc' },
        },
        tickets: {
          orderBy: { createdAt: 'desc' },
          include: {
            replies: { select: { id: true } },
          },
        },
        installations: {
          include: {
            app: {
              select: { id: true, name: true, icon: true, version: true },
            },
          },
        },
      },
    });

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const latestMetric = agent.metrics[0] || null;
    const metricsHistory = agent.metrics.slice(0, 48);

    return NextResponse.json({
      id: agent.id,
      hostname: agent.hostname,
      os: agent.os,
      platform: agent.platform,
      ip: agent.ip,
      version: agent.version,
      lastSeen: agent.lastSeen,
      status: agent.status,
      createdAt: agent.createdAt,
      latestMetric,
      metricsHistory,
      tickets: agent.tickets.map((t: any) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        replyCount: t.replies?.length || 0,
      })),
      installations: agent.installations.map((i: any) => ({
        id: i.id,
        status: i.status,
        createdAt: i.createdAt,
        app: i.app,
        installedBy: i.installedBy,
      })),
    });
  } catch (error) {
    console.error('Get agent error:', error);
    return NextResponse.json({ error: 'Failed to get agent' }, { status: 500 });
  }
}
