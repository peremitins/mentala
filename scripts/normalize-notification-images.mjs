import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const NOTIFICATIONS_ROOT = path.join(
  process.cwd(),
  'public',
  'notifications'
);
const GENDER_DIRS = new Set(['male', 'female']);
const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(entryPath);
      dirs.push(...(await walk(entryPath)));
    }
  }
  return dirs;
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resolveTargetName(targetDir, baseName, gender, sourcePath) {
  const targetPath = path.join(targetDir, baseName);
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) {
      throw new Error('not-file');
    }
    const [sourceHash, targetHash] = await Promise.all([
      hashFile(sourcePath),
      hashFile(targetPath),
    ]);
    if (sourceHash === targetHash) {
      return { targetPath, action: 'duplicate' };
    }
  } catch {
    return { targetPath, action: 'move' };
  }

  const parsed = path.parse(baseName);
  let counter = 1;
  while (true) {
    const candidateName = `${parsed.name}-${gender}-${counter}${parsed.ext}`;
    const candidatePath = path.join(targetDir, candidateName);
    try {
      const stat = await fs.stat(candidatePath);
      if (!stat.isFile()) {
        throw new Error('not-file');
      }
      const [sourceHash, targetHash] = await Promise.all([
        hashFile(sourcePath),
        hashFile(candidatePath),
      ]);
      if (sourceHash === targetHash) {
        return { targetPath: candidatePath, action: 'duplicate' };
      }
    } catch {
      return { targetPath: candidatePath, action: 'move' };
    }
    counter += 1;
  }
}

async function moveGenderDir(dirPath) {
  const gender = path.basename(dirPath);
  if (!GENDER_DIRS.has(gender)) return { moved: 0, removed: 0, skipped: 0 };

  const targetDir = path.join(path.dirname(dirPath), 'neutral');
  await ensureDir(targetDir);

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  let moved = 0;
  let removed = 0;
  let skipped = 0;

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      // Внутри gender-папок не ожидаем подпапки.
      skipped += 1;
      continue;
    }

    if (entry.name === '.DS_Store') {
      await fs.unlink(entryPath);
      removed += 1;
      continue;
    }

    if (!IMAGE_EXT_RE.test(entry.name)) {
      skipped += 1;
      continue;
    }

    const { targetPath, action } = await resolveTargetName(
      targetDir,
      entry.name,
      gender,
      entryPath
    );

    if (action === 'duplicate') {
      await fs.unlink(entryPath);
      removed += 1;
    } else {
      await fs.rename(entryPath, targetPath);
      moved += 1;
    }
  }

  const remaining = await fs.readdir(dirPath);
  if (remaining.length === 0) {
    await fs.rmdir(dirPath);
  }

  return { moved, removed, skipped };
}

async function main() {
  const rootStat = await fs.stat(NOTIFICATIONS_ROOT).catch(() => null);
  if (!rootStat?.isDirectory()) {
    console.error('❌ Директория public/notifications не найдена');
    process.exit(1);
  }

  const allDirs = await walk(NOTIFICATIONS_ROOT);
  let movedTotal = 0;
  let removedTotal = 0;
  let skippedTotal = 0;

  for (const dirPath of allDirs) {
    if (!GENDER_DIRS.has(path.basename(dirPath))) continue;
    const result = await moveGenderDir(dirPath);
    movedTotal += result.moved;
    removedTotal += result.removed;
    skippedTotal += result.skipped;
  }

  console.log('✅ Нормализация изображений уведомлений завершена');
  console.log(`   Перемещено: ${movedTotal}`);
  console.log(`   Удалено (дубли): ${removedTotal}`);
  console.log(`   Пропущено: ${skippedTotal}`);
}

main().catch((error) => {
  console.error('❌ Не удалось нормализовать изображения:', error);
  process.exit(1);
});
