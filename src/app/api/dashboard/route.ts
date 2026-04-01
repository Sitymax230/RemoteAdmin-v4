import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Run all queries in parallel for performance
    const [
      totalAgents,
      onlineAgents,
      totalTickets,
      openTickets,
      totalApps,
      totalInstallations,
      latestMetrics,
      recentAuditLogs,
      ticketStatusCounts,
    ] = await Promise.all([
      // Total agents
      db.agent.count(),

      // Online agents
      db.agent.count({ where: { status: 'online' } }),

      // Total tickets
      db.ticket.count(),

      // Open tickets
      db.ticket.count({
        where: {
          status: { in: ['open', 'in_progress'] },
        },
      }),

      // Total store apps
      db.storeApp.count(),

      // Total installations
      db.installation.count(),

      // Latest metrics from each agent for average CPU/Memory
      db.$queryRaw<
        Array<{ cpu: number; memory: number }>
      >`
        SELECT m.cpu, m.memory
        FROM AgentMetric m
        INNER JOIN (
          SELECT agentId, MAX(timestamp) as maxTs
          FROM AgentMetric
          GROUP BY agentId
        ) latest ON m.agentId = latest.agentId AND m.timestamp = latest.maxTs
      `,

      // Recent audit logs (last 10)
      db.auditLog.findMany({
        take: 10,
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

      // Ticket stats by status
      db.ticket.groupBy({
        by: ['status'],
        _count: {
          status: true,
        },
      }),
    ]);

    // Calculate average CPU and memory
    let avgCpu = 0;
    let avgMemory = 0;
    if (latestMetrics.length > 0) {
      const totalCpu = latestMetrics.reduce((sum, m) => sum + m.cpu, 0);
      const totalMemory = latestMetrics.reduce((sum, m) => sum + m.memory, 0);
      avgCpu = Math.round((totalCpu / latestMetrics.length) * 100) / 100;
      avgMemory = Math.round((totalMemory / latestMetrics.length) * 100) / 100;
    }

    // Format ticket stats by status
    const ticketStatsByStatus: Record<string, number> = {};
    for (const group of ticketStatusCounts) {
      ticketStatsByStatus[group.status] = group._count.status;
    }

    return NextResponse.json({
      agents: {
        total: totalAgents,
        online: onlineAgents,
      },
      tickets: {
        total: totalTickets,
        open: openTickets,
        byStatus: ticketStatsByStatus,
      },
      store: {
        totalApps: totalApps,
        totalInstallations: totalInstallations,
      },
      metrics: {
        avgCpu,
        avgMemory,
      },
      recentAuditLogs,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard stats' },
      { status: 500 }
    );
  }
}
