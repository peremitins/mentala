import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const AUDIO_ROOT = path.join(process.cwd(), 'public/meditations/audio');
const MAP_PATH = path.join(process.cwd(), 'scripts/meditation-audio-map.json');
const REFERENCE_FILES = [
  'server/infrastructure/db/seed-meditations.ts',
  'app/lib/sceneSelectionCatalog.ts',
];

const HASH_RE = /\.[a-f0-9]{8}\.m4a$/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.m4a')) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPublicPath(filePath) {
  const rel = path.relative(path.join(process.cwd(), 'public'), filePath);
  return `/${rel.split(path.sep).join('/')}`;
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  // Берем короткий хэш, чтобы имя оставалось читаемым.
  return createHash('sha256').update(data).digest('hex').slice(0, 8);
}

async function updateReferences(mapping) {
  for (const file of REFERENCE_FILES) {
    const abs = path.join(process.cwd(), file);
    let content = await fs.readFile(abs, 'utf8');
    let changed = false;
    for (const [oldPath, newPath] of Object.entries(mapping)) {
      if (content.includes(oldPath)) {
        content = content.split(oldPath).join(newPath);
        changed = true;
      }
    }
    if (changed) {
      await fs.writeFile(abs, content, 'utf8');
    }
  }
}

async function main() {
  const files = await walk(AUDIO_ROOT);
  const mapping = {};

  for (const filePath of files) {
    if (HASH_RE.test(filePath)) {
      continue;
    }
    const hash = await hashFile(filePath);
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, '.m4a');
    const nextName = `${base}.${hash}.m4a`;
    const nextPath = path.join(dir, nextName);

    await fs.rename(filePath, nextPath);

    const oldPublic = toPublicPath(filePath);
    const newPublic = toPublicPath(nextPath);
    mapping[oldPublic] = newPublic;
  }

  await fs.writeFile(MAP_PATH, JSON.stringify(mapping, null, 2), 'utf8');
  await updateReferences(mapping);

  console.log('✅ Медиа-файлы переименованы и ссылки обновлены.');
  console.log(`🗺️  Карта сохранена в ${path.relative(process.cwd(), MAP_PATH)}`);
}

main().catch((error) => {
  console.error('❌ Ошибка при версионировании медиа:', error);
  process.exit(1);
});
