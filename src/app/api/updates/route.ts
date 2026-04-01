import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const updates = await db.agentUpdate.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(updates);
  } catch (error) {
    console.error('List updates error:', error);
    return NextResponse.json(
      { error: 'Failed to list updates' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { version, filename, platform } = body;

    if (!version || !filename) {
      return NextResponse.json(
        { error: 'Version and filename are required' },
        { status: 400 }
      );
    }

    const validPlatforms = ['windows', 'linux', 'both'];
    const updatePlatform = platform && validPlatforms.includes(platform)
      ? platform
      : 'windows';

    const update = await db.agentUpdate.create({
      data: {
        version,
        filename,
        filePath: `/updates/${filename}`,
        platform: updatePlatform,
        fileSize: 0,
      },
    });

    return NextResponse.json(update, { status: 201 });
  } catch (error) {
    console.error('Create update error:', error);
    return NextResponse.json(
      { error: 'Failed to create update' },
      { status: 500 }
    );
  }
}
