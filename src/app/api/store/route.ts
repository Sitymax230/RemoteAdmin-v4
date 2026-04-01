import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { writeFile } from 'fs/promises';

const APP_FILES_DIR = join(process.cwd(), 'public', 'app-files');

export async function GET() {
  try {
    const apps = await db.storeApp.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const result = apps.map((app) => ({
      id: app.id,
      name: app.name,
      description: app.description,
      category: app.category,
      icon: app.icon,
      installCmd: app.installCmd,
      installArgs: app.installArgs ?? '/S',
      uninstallCmd: app.uninstallCmd,
      platform: app.platform,
      version: app.version,
      featured: app.featured,
      fileName: app.fileName ?? '',
      fileSize: app.fileSize ?? 0,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('List store apps error:', error);
    return NextResponse.json({ error: 'Failed to list store apps' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name, description, category, icon,
      installCmd, installArgs, uninstallCmd,
      platform, version, featured,
      fileName, fileSize,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const app = await db.storeApp.create({
      data: {
        name,
        description: description || '',
        category: category || 'General',
        icon: icon || '📦',
        installCmd: installCmd || '',
        installArgs: installArgs || '/S',
        uninstallCmd: uninstallCmd || '',
        platform: platform || 'windows',
        version: version || '1.0.0',
        featured: featured || false,
        fileName: fileName || '',
        fileSize: fileSize || 0,
      },
    });

    return NextResponse.json(app, { status: 201 });
  } catch (error) {
    console.error('Create store app error:', error);
    return NextResponse.json({ error: 'Failed to create store app' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: 'App ID is required' }, { status: 400 });
    }

    const existing = await db.storeApp.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'name', 'description', 'category', 'icon',
      'installCmd', 'installArgs', 'uninstallCmd',
      'platform', 'version', 'featured',
      'fileName', 'fileSize',
    ];

    for (const field of allowedFields) {
      if (fields[field] !== undefined) {
        updateData[field] = fields[field];
      }
    }

    const app = await db.storeApp.update({ where: { id }, data: updateData });
    return NextResponse.json(app);
  } catch (error) {
    console.error('Update store app error:', error);
    return NextResponse.json({ error: 'Failed to update store app' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'App ID is required' }, { status: 400 });
    }

    await db.storeApp.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'App deleted' });
  } catch (error) {
    console.error('Delete store app error:', error);
    return NextResponse.json({ error: 'Failed to delete store app' }, { status: 500 });
  }
}
