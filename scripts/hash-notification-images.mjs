import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const NOTIFICATIONS_ROOT = path.join(PUBLIC_ROOT, 'notifications');
const CACHE_ROOT = path.join(process.cwd(), 'scripts/.notification-cache');
const OUTPUT_ROOT = path.join(CACHE_ROOT, 'notifications');
const MAP_PATH = path.join(
  process.cwd(),
  'server/application/notifications/notification-image-map.json'
);

const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;

function toPosix(relPath) {
  return relPath.split(path.sep).filter(Boolean).join('/');
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
    } else if (entry.isFile() && IMAGE_EXT_RE.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return createHash('sha256').update(data).digest('hex').slice(0, 8);
}

async function prepareCache() {
  await fs.rm(CACHE_ROOT, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
}

async function ensureMapFile() {
  await fs.mkdir(path.dirname(MAP_PATH), { recursive: true });
}

async function main() {
  if (!(await fs.stat(NOTIFICATIONS_ROOT).catch(() => null))) {
    console.error('❌ Директория public/notifications не найдена');
    process.exit(1);
  }

  const files = await walk(NOTIFICATIONS_ROOT);
  if (!files.length) {
    console.log('ℹ️  Не найдено изображений для уведомлений в public/notifications');
  }

  await prepareCache();
  await ensureMapFile();

  const mapping = {};

  for (const file of files) {
    const relPath = path.relative(NOTIFICATIONS_ROOT, file);
    const normalizedRel = toPosix(relPath);
    const hash = await hashFile(file);
    const parsed = path.posix.parse(normalizedRel);
    const hashedName = `${parsed.name}.${hash}${parsed.ext}`;
    const targetDir = parsed.dir
      ? path.join(OUTPUT_ROOT, ...parsed.dir.split('/'))
      : OUTPUT_ROOT;
    const targetPath = path.join(targetDir, hashedName);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.copyFile(file, targetPath);

    const sourcePublic = `/notifications/${normalizedRel}`;
    const hashedPublic =
      parsed.dir === ''
        ? `/notifications/${hashedName}`
        : `/notifications/${parsed.dir}/${hashedName}`;

    mapping[sourcePublic] = hashedPublic;
  }

  await fs.writeFile(MAP_PATH, JSON.stringify(mapping, null, 2), 'utf8');

  console.log('✅ Генерируем хэшированные изображения уведомлений');
  console.log(`🗺️  Карта сохранена в ${path.relative(process.cwd(), MAP_PATH)}`);
  console.log(`📦 Файлы записаны в ${path.relative(process.cwd(), CACHE_ROOT)}`);
}

main().catch((error) => {
  console.error('❌ Не удалось собрать хэшированные картинки:', error);
  process.exit(1);
});
