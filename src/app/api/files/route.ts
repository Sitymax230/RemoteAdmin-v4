import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, statSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const APP_FILES_DIR = join(process.cwd(), 'public', 'app-files');

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function listDirRecursive(basePath: string, relativeTo: string): { name: string; path: string; size: number; isDir: boolean; modified: string }[] {
  const items: { name: string; path: string; size: number; isDir: boolean; modified: string }[] = [];
  if (!existsSync(basePath)) return items;

  const entries = readdirSync(basePath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(basePath, entry.name);
    const relPath = join(relativeTo, entry.name);
    const stat = statSync(fullPath);

    if (entry.isDirectory()) {
      items.push({ name: entry.name, path: relPath, size: 0, isDir: true, modified: stat.mtime.toISOString() });
      items.push(...listDirRecursive(fullPath, relPath));
    } else {
      items.push({ name: entry.name, path: relPath, size: stat.size, isDir: false, modified: stat.mtime.toISOString() });
    }
  }
  return items;
}

export async function GET() {
  try {
    ensureDir(APP_FILES_DIR);
    const items = listDirRecursive(APP_FILES_DIR, '');
    return NextResponse.json({ files: items, basePath: '/app-files' });
  } catch {
    return NextResponse.json({ files: [], basePath: '/app-files' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, folderName, filePath } = body;

    if (action === 'mkdir' && folderName) {
      const folderPath = join(APP_FILES_DIR, folderName);
      ensureDir(folderPath);
      return NextResponse.json({ success: true, message: `Папка "${folderName}" создана` });
    }

    if (action === 'delete' && filePath) {
      const fullPath = join(APP_FILES_DIR, filePath);
      if (existsSync(fullPath)) {
        rmSync(fullPath, { recursive: true, force: true });
        return NextResponse.json({ success: true, message: `"${filePath}" удалён` });
      }
      return NextResponse.json({ error: 'Файл не найден' }, { status: 404 });
    }

    return NextResponse.json({ error: 'Неверное действие' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Ошибка операции' }, { status: 500 });
  }
}
