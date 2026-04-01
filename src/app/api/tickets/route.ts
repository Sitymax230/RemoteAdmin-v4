import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = await db.ticket.findMany({
      where,
      include: {
        agent: {
          select: {
            id: true,
            hostname: true,
            os: true,
            platform: true,
            status: true,
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = tickets.map((ticket) => ({
      id: ticket.id,
      agentId: ticket.agentId,
      agent: ticket.agent,
      subject: ticket.subject,
      message: ticket.message,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      replyCount: ticket._count.replies,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('List tickets error:', error);
    return NextResponse.json(
      { error: 'Failed to list tickets' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, message, isAdmin, authorId } = body;

    if (!ticketId || !message) {
      return NextResponse.json(
        { error: 'Ticket ID and message are required' },
        { status: 400 }
      );
    }

    const ticket = await db.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    const reply = await db.ticketReply.create({
      data: {
        ticketId,
        message,
        isAdmin: isAdmin || false,
        authorId: authorId || null,
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    });

    // Update ticket timestamp
    await db.ticket.update({
      where: { id: ticketId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(reply, { status: 201 });
  } catch (error) {
    console.error('Create ticket reply error:', error);
    return NextResponse.json(
      { error: 'Failed to create ticket reply' },
      { status: 500 }
    );
  }
}
