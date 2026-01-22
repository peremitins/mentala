import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PUBLIC_ROOT = path.join(process.cwd(), 'public');
const COVERS_ROOT = path.join(PUBLIC_ROOT, 'meditations/covers');
const BACKGROUNDS_ROOT = path.join(PUBLIC_ROOT, 'meditations/backgrounds');
const MAP_PATH = path.join(process.cwd(), 'scripts/meditation-image-map.json');
const REFERENCE_FILES = [
  'server/infrastructure/db/seed-meditations.ts',
  'app/lib/sceneSelectionCatalog.ts',
];

const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;
const HASH_RE = /\.[a-f0-9]{8}(?:-portrait\d*)?\.(webp|png|jpe?g)$/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (entry.isFile() && IMAGE_EXT_RE.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPublicPath(filePath) {
  const rel = path.relative(PUBLIC_ROOT, filePath);
  return `/${rel.split(path.sep).join('/')}`;
}

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  // Берем короткий хэш, чтобы имя оставалось читаемым.
  return createHash('sha256').update(data).digest('hex').slice(0, 8);
}

function parseBackgroundName(fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);

  if (stem.startsWith('portrait-')) {
    return {
      baseStem: stem.slice('portrait-'.length),
      ext,
      variant: 'portrait-prefix',
      portraitSuffix: '',
    };
  }

  const portraitMatch = stem.match(/^(.*)-portrait(\d*)$/);
  if (portraitMatch) {
    return {
      baseStem: portraitMatch[1],
      ext,
      variant: 'portrait-suffix',
      portraitSuffix: portraitMatch[2] || '',
    };
  }

  return { baseStem: stem, ext, variant: 'base', portraitSuffix: '' };
}

function parseHashedBackgroundName(fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  const isPrefix = stem.startsWith('portrait-');
  const normalized = isPrefix ? stem.slice('portrait-'.length) : stem;

  const match = normalized.match(/^(.+)\.([a-f0-9]{8})(-portrait\d*)?$/i);
  if (!match) return null;

  return {
    baseStem: match[1],
    hash: match[2],
    ext,
  };
}

function buildBackgroundName(baseStem, hash, entry) {
  if (entry.variant === 'portrait-prefix') {
    return `portrait-${baseStem}.${hash}${entry.ext}`;
  }

  if (entry.variant === 'portrait-suffix') {
    const suffix = entry.portraitSuffix ? entry.portraitSuffix : '';
    return `${baseStem}.${hash}-portrait${suffix}${entry.ext}`;
  }

  return `${baseStem}.${hash}${entry.ext}`;
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

async function processCovers(mapping) {
  const files = await walk(COVERS_ROOT);

  for (const filePath of files) {
    if (HASH_RE.test(filePath)) {
      continue;
    }
    const hash = await hashFile(filePath);
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const nextName = `${base}.${hash}${ext}`;
    const nextPath = path.join(dir, nextName);

    await fs.rename(filePath, nextPath);

    const oldPublic = toPublicPath(filePath);
    const newPublic = toPublicPath(nextPath);
    mapping[oldPublic] = newPublic;
  }
}

async function processBackgrounds(mapping) {
  const entries = await fs.readdir(BACKGROUNDS_ROOT, { withFileTypes: true });
  const groups = new Map();
  const existingHashes = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXT_RE.test(entry.name)) {
      continue;
    }

    if (HASH_RE.test(entry.name)) {
      const parsed = parseHashedBackgroundName(entry.name);
      if (parsed) {
        const current = existingHashes.get(parsed.baseStem);
        if (current && current !== parsed.hash) {
          throw new Error(
            `Несовпадающие хэши для ${parsed.baseStem}: ${current} и ${parsed.hash}`
          );
        }
        existingHashes.set(parsed.baseStem, parsed.hash);
      }
      continue;
    }

    const parsed = parseBackgroundName(entry.name);
    const fullPath = path.join(BACKGROUNDS_ROOT, entry.name);
    const list = groups.get(parsed.baseStem) || [];
    list.push({ ...parsed, fileName: entry.name, fullPath });
    groups.set(parsed.baseStem, list);
  }

  for (const [baseStem, items] of groups.entries()) {
    let hash = existingHashes.get(baseStem);
    if (!hash) {
      const baseItem = items.find((item) => item.variant === 'base') || items[0];
      hash = await hashFile(baseItem.fullPath);
    }

    for (const entry of items) {
      const nextName = buildBackgroundName(baseStem, hash, entry);
      const nextPath = path.join(BACKGROUNDS_ROOT, nextName);

      await fs.rename(entry.fullPath, nextPath);

      const oldPublic = toPublicPath(entry.fullPath);
      const newPublic = toPublicPath(nextPath);
      mapping[oldPublic] = newPublic;
    }
  }
}

async function main() {
  const mapping = {};

  await processCovers(mapping);
  await processBackgrounds(mapping);

  await fs.writeFile(MAP_PATH, JSON.stringify(mapping, null, 2), 'utf8');
  await updateReferences(mapping);

  console.log('✅ Картинки переименованы и ссылки обновлены.');
  console.log(`🗺️  Карта сохранена в ${path.relative(process.cwd(), MAP_PATH)}`);
}

main().catch((error) => {
  console.error('❌ Ошибка при версионировании картинок:', error);
  process.exit(1);
});
