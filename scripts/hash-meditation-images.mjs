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

/** Старые пути → новые (для обновления БД и ссылок в seed/sceneSelectionCatalog) */
const LEGACY_MIGRATIONS = {
  '/meditations/covers/ocean-slow.fd27232b.webp':
    '/meditations/covers/ocean-slow.b4b7c127.webp',
  '/meditations/covers/rain-night.6c73e019.webp':
    '/meditations/covers/rain-night.9468982c.webp',
  '/meditations/covers/rain-night.e9a5fa50.webp':
    '/meditations/covers/rain-night.9468982c.webp',
  '/meditations/backgrounds/ocean-slow.08de5010.webp':
    '/meditations/backgrounds/ocean-slow.ed61a3eb.webp',
  '/meditations/backgrounds/ocean-slow.08de5010-portrait.webp':
    '/meditations/backgrounds/ocean-slow.ed61a3eb-portrait.webp',
  '/meditations/backgrounds/rain-night.405ab09f.webp':
    '/meditations/backgrounds/rain-night.00d147c2.webp',
  '/meditations/backgrounds/rain-night.405ab09f-portrait.webp':
    '/meditations/backgrounds/rain-night.00d147c2-portrait.webp',
};

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

/** Извлекает base и hash из имени вида base.hash.webp */
function parseHashedCoverName(filePath) {
  const name = path.basename(filePath);
  const match = name.match(/^(.+)\.([a-f0-9]{8})\.(webp|png|jpe?g)$/i);
  return match
    ? { baseStem: match[1], ext: '.' + match[3], filenameHash: match[2] }
    : null;
}

async function processCovers(mapping) {
  const files = await walk(COVERS_ROOT);

  for (const filePath of files) {
    const hash = await hashFile(filePath);
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);

    // Уже хэшированный файл: проверяем, совпадает ли хэш в имени с реальным
    const hashed = parseHashedCoverName(filePath);
    if (hashed) {
      if (hashed.filenameHash === hash) continue; // контент не менялся, пропускаем
      // Контент изменился — переименовываем с новым хэшем
    }

    const base = hashed ? hashed.baseStem : path.basename(filePath, ext);
    const nextName = `${base}.${hash}${ext}`;
    const nextPath = path.join(dir, nextName);
    if (filePath === nextPath) continue;

    await fs.rename(filePath, nextPath);

    const oldPublic = toPublicPath(filePath);
    const newPublic = toPublicPath(nextPath);
    mapping[oldPublic] = newPublic;
  }
}

async function processBackgrounds(mapping) {
  const entries = await fs.readdir(BACKGROUNDS_ROOT, { withFileTypes: true });
  const groups = new Map();
  const hashedFilesByStem = new Map(); // baseStem -> [{ parsed, fullPath }]

  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXT_RE.test(entry.name)) {
      continue;
    }

    const fullPath = path.join(BACKGROUNDS_ROOT, entry.name);

    if (HASH_RE.test(entry.name)) {
      const parsed = parseHashedBackgroundName(entry.name);
      if (parsed) {
        const list = hashedFilesByStem.get(parsed.baseStem) || [];
        list.push({ parsed, fullPath, entry });
        hashedFilesByStem.set(parsed.baseStem, list);
      }
      continue;
    }

    const parsed = parseBackgroundName(entry.name);
    const list = groups.get(parsed.baseStem) || [];
    list.push({ ...parsed, fileName: entry.name, fullPath });
    groups.set(parsed.baseStem, list);
  }

  // Пересчёт хэша для уже хэшированных файлов, если контент изменился
  for (const [baseStem, items] of hashedFilesByStem.entries()) {
    const baseItem = items.find((i) => !i.entry.name.includes('-portrait'));
    const baseFile = baseItem || items[0];
    const realHash = await hashFile(baseFile.fullPath);
    const filenameHash = baseFile.parsed.hash;

    if (realHash === filenameHash) continue; // контент не менялся

    for (const { parsed, fullPath, entry } of items) {
      const stem = path.basename(entry.name, parsed.ext);
      const portraitMatch = stem.match(/-portrait(\d*)$/);
      const variant = portraitMatch ? 'portrait-suffix' : 'base';
      const portraitSuffix = portraitMatch ? portraitMatch[1] || '' : '';

      const nextName = buildBackgroundName(baseStem, realHash, {
        variant,
        portraitSuffix,
        ext: parsed.ext,
      });
      const nextPath = path.join(BACKGROUNDS_ROOT, nextName);
      if (fullPath === nextPath) continue;

      await fs.rename(fullPath, nextPath);

      const oldPublic = toPublicPath(fullPath);
      const newPublic = toPublicPath(nextPath);
      mapping[oldPublic] = newPublic;
    }
  }

  // Обработка нехэшированных файлов (как раньше)
  for (const [baseStem, items] of groups.entries()) {
    const hash = await hashFile(
      (items.find((i) => i.variant === 'base') || items[0]).fullPath
    );

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

/** Строит полную карту logical→hashed по текущим файлам на диске */
async function buildFullMapFromDisk() {
  const mapping = {};

  for (const filePath of await walk(COVERS_ROOT)) {
    const parsed = parseHashedCoverName(filePath);
    if (parsed) {
      const logical = `/${path
        .relative(
          PUBLIC_ROOT,
          path.join(path.dirname(filePath), parsed.baseStem + parsed.ext)
        )
        .split(path.sep)
        .join('/')}`;
      mapping[logical] = toPublicPath(filePath);
    }
  }

  for (const entry of await fs.readdir(BACKGROUNDS_ROOT, {
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !IMAGE_EXT_RE.test(entry.name)) continue;
    const parsed = parseHashedBackgroundName(entry.name);
    if (parsed) {
      const fullPath = path.join(BACKGROUNDS_ROOT, entry.name);
      const publicPath = toPublicPath(fullPath);
      const stem = path.basename(entry.name, parsed.ext);
      const portraitSuffix = stem.match(/-portrait\d*$/)?.[0] || '';
      mapping[
        `/meditations/backgrounds/${parsed.baseStem}${portraitSuffix}${parsed.ext}`
      ] = publicPath;
    }
  }

  return mapping;
}

async function main() {
  const newMappings = {};
  await processCovers(newMappings);
  await processBackgrounds(newMappings);

  // Собираем полную карту: сначала с диска, потом дельта переименований
  const mapping = await buildFullMapFromDisk();

  for (const [oldPath, newPath] of Object.entries(newMappings)) {
    mapping[oldPath] = newPath;
    for (const [k, v] of [...Object.entries(mapping)]) {
      if (v === oldPath && k !== oldPath) mapping[k] = newPath;
    }
  }

  // Добавляем legacy-миграции (oldPath→newPath для обновления БД)
  Object.assign(mapping, LEGACY_MIGRATIONS);

  await fs.writeFile(MAP_PATH, JSON.stringify(mapping, null, 2), 'utf8');
  await updateReferences(mapping);

  const changed = Object.keys(newMappings).length;
  if (changed > 0) {
    console.log(`✅ Переименовано файлов: ${changed}. Ссылки обновлены.`);
  } else {
    console.log(
      '✅ Нет файлов для переименования (все хэши соответствуют контенту).'
    );
  }
  console.log(
    `🗺️  Карта сохранена в ${path.relative(process.cwd(), MAP_PATH)}`
  );
}

main().catch((error) => {
  console.error('❌ Ошибка при версионировании картинок:', error);
  process.exit(1);
});
