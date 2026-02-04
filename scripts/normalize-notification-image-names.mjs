import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.join(
  process.cwd(),
  'public',
  'notifications',
  'habits'
);

const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;
const TEMP_SUFFIX = '.renametmp';

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

async function hashFile(filePath) {
  const data = await fs.readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

function parseBaseName(fileName) {
  const parsed = path.parse(fileName);
  const strippedGender = parsed.name.replace(/-(male|female)(-\d+)?$/i, '');
  const compacted = strippedGender.replace(/(_\d+)+$/, '');
  return { base: compacted, ext: parsed.ext };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value) {
  const data = createHash('sha256').update(value).digest();
  return data.readUInt32BE(0);
}

function shuffle(array, seedKey) {
  const rng = mulberry32(hashSeed(seedKey));
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function interleaveGroups(groups) {
  const buckets = groups.map((group) => [...group]);
  const result = [];
  let remaining = buckets.reduce((sum, group) => sum + group.length, 0);
  let index = 0;

  while (remaining > 0) {
    const group = buckets[index % buckets.length];
    if (group.length > 0) {
      result.push(group.shift());
      remaining -= 1;
    }
    index += 1;
  }

  return result;
}

async function buildPlanForDir(dirPath) {
  const files = await listImages(dirPath);
  if (files.length === 0) return null;

  const fileEntries = await Promise.all(
    files.map(async (filePath) => {
      const fileName = path.basename(filePath);
      const { base, ext } = parseBaseName(fileName);
      const hash = await hashFile(filePath);
      return { filePath, fileName, base, ext, hash };
    })
  );

  const baseGroups = new Map();
  for (const entry of fileEntries) {
    const list = baseGroups.get(entry.base) ?? [];
    list.push(entry);
    baseGroups.set(entry.base, list);
  }

  const plans = [];
  for (const [base, entries] of baseGroups.entries()) {
    const hashGroups = new Map();
    for (const entry of entries) {
      const list = hashGroups.get(entry.hash) ?? [];
      list.push(entry);
      hashGroups.set(entry.hash, list);
    }

    const orderedHashes = Array.from(hashGroups.keys()).sort();
    const grouped = orderedHashes.map((hashValue) => {
      const group = hashGroups.get(hashValue) ?? [];
      return shuffle(group, `${base}:${hashValue}`);
    });

    const mixed = interleaveGroups(grouped);
    plans.push({ base, entries: mixed });
  }

  return plans;
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
  const plans = await buildPlanForDir(dirPath);
  if (!plans) return { renamed: 0 };

  const renameOps = [];

  for (const plan of plans) {
    const { base, entries } = plan;
    let counter = 1;
    for (const entry of entries) {
      const nextName = `${base}_${String(counter).padStart(2, '0')}${entry.ext}`;
      const targetPath = path.join(dirPath, nextName);
      renameOps.push({
        base,
        original: entry.filePath,
        target: targetPath,
      });
      counter += 1;
    }
  }

  if (renameOps.length === 0) return { renamed: 0 };

  await renameWithTemp(renameOps);

  return { renamed: renameOps.length };
}

async function main() {
  const targetRoot = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_ROOT;

  const rootStat = await fs.stat(targetRoot).catch(() => null);
  if (!rootStat?.isDirectory()) {
    console.error(`❌ Директория не найдена: ${toPosix(targetRoot)}`);
    process.exit(1);
  }

  const tagDirPattern =
    /\/(activity|nature|meditation|daily_life|neutral|neutral_abstract|harm_organs|harm_appearance|harm_mental)$/;

  let targetDirs = [];
  if (process.argv[2]) {
    const images = await listImages(targetRoot);
    if (images.length > 0) {
      targetDirs = [targetRoot];
    } else {
      const dirs = await walkDirs(targetRoot);
      targetDirs = dirs.filter((dirPath) =>
        tagDirPattern.test(toPosix(dirPath))
      );
    }
  } else {
    const dirs = await walkDirs(targetRoot);
    targetDirs = dirs.filter((dirPath) =>
      tagDirPattern.test(toPosix(dirPath))
    );
  }

  let totalRenamed = 0;
  if (targetDirs.length === 0) {
    console.log('ℹ️  Не найдено подходящих каталогов для нормализации.');
    console.log(
      '   Проверь путь или структуру. Можно указать конкретную папку аргументом.'
    );
  }

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
