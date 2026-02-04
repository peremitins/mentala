import { promises as fs } from 'node:fs';
import path from 'node:path';

const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;
const TEMP_SUFFIX = '.renametmp';

const TAG_NAMES = new Set([
  'activity',
  'nature',
  'meditation',
  'daily_life',
  'neutral',
  'neutral_abstract',
  'harm_organs',
  'harm_appearance',
  'harm_mental',
]);

function toPosix(filePath) {
  return filePath.split(path.sep).filter(Boolean).join('/');
}

async function walkDirs(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(entryPath);
      dirs.push(...(await walkDirs(entryPath)));
    }
  }
  return dirs;
}

async function listImages(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => path.join(dir, entry.name));
}

function detectTagFromPath(dirPath) {
  const base = path.basename(dirPath);
  return TAG_NAMES.has(base) ? base : null;
}

function padIndex(index) {
  return String(index).padStart(2, '0');
}

async function renameWithTemp(planItems) {
  for (const item of planItems) {
    const tempPath = `${item.original}${TEMP_SUFFIX}`;
    await fs.rename(item.original, tempPath);
    item.temp = tempPath;
  }

  for (const item of planItems) {
    await fs.rename(item.temp, item.target);
  }
}

async function normalizeDir(dirPath) {
  const tag = detectTagFromPath(dirPath);
  if (!tag) return { renamed: 0 };

  const files = await listImages(dirPath);
  if (files.length === 0) return { renamed: 0 };

  const sorted = files.sort((left, right) =>
    path.basename(left).localeCompare(path.basename(right))
  );

  const renameOps = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const original = sorted[index];
    const ext = path.extname(original);
    const nextName = `${tag}_${padIndex(index + 1)}${ext}`;
    const target = path.join(dirPath, nextName);
    renameOps.push({ original, target });
  }

  await renameWithTemp(renameOps);
  return { renamed: renameOps.length };
}

async function main() {
  const targetRoot = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(process.cwd(), 'public', 'notifications');

  const rootStat = await fs.stat(targetRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    console.error(`❌ Директория не найдена: ${toPosix(targetRoot)}`);
    process.exit(1);
  }

  let targetDirs = [];
  const directTag = detectTagFromPath(targetRoot);
  if (directTag) {
    targetDirs = [targetRoot];
  } else {
    const dirs = await walkDirs(targetRoot);
    targetDirs = dirs.filter((dirPath) => detectTagFromPath(dirPath));
  }

  if (targetDirs.length === 0) {
    console.log('ℹ️  Не найдено подходящих каталогов для нормализации.');
    console.log(
      '   Можно передать конкретную папку тега, например: public/notifications/common/meditation'
    );
    return;
  }

  let totalRenamed = 0;
  for (const dirPath of targetDirs) {
    const result = await normalizeDir(dirPath);
    if (result.renamed > 0) {
      console.log(
        `✅ ${toPosix(path.relative(process.cwd(), dirPath))}: ${result.renamed} переименовано`
      );
      totalRenamed += result.renamed;
    }
  }

  console.log(`Готово. Переименовано файлов: ${totalRenamed}`);
  console.log('ℹ️  Файлы не удаляются, только переименовываются.');
}

main().catch((error) => {
  console.error('❌ Ошибка при нормализации имён:', error);
  process.exit(1);
});
