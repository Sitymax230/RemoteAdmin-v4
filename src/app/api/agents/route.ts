import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const agents = await db.agent.findMany({
      include: {
        metrics: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            tickets: true,
            installations: true,
          },
        },
      },
      orderBy: { lastSeen: 'desc' },
    });

    // Transform to include the latest metric flattened
    const result = agents.map((agent) => ({
      id: agent.id,
      hostname: agent.hostname,
      os: agent.os,
      platform: agent.platform,
      ip: agent.ip,
      version: agent.version,
      lastSeen: agent.lastSeen,
      status: agent.status,
      createdAt: agent.createdAt,
      ticketCount: agent._count.tickets,
      installationCount: agent._count.installations,
      latestMetric: agent.metrics[0]
        ? {
            cpu: agent.metrics[0].cpu,
            memory: agent.metrics[0].memory,
            diskTotal: agent.metrics[0].diskTotal,
            diskUsed: agent.metrics[0].diskUsed,
            uptime: agent.metrics[0].uptime,
            timestamp: agent.metrics[0].timestamp,
          }
        : null,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('List agents error:', error);
    return NextResponse.json(
      { error: 'Failed to list agents' },
      { status: 500 }
    );
  }
}
