import { promises as fs } from 'node:fs';
import path from 'node:path';

const AUDIO_ROOT = path.join(process.cwd(), 'public/meditations/audio');
const COVERS_ROOT = path.join(process.cwd(), 'public/meditations/covers');
const BACKGROUNDS_ROOT = path.join(
  process.cwd(),
  'public/meditations/backgrounds'
);

// Проверяем, что файлы версионированы через content-hash в имени.
const AUDIO_HASH_RE = /\.[a-f0-9]{8}\.m4a$/i;
const IMAGE_HASH_RE = /\.[a-f0-9]{8}(?:-portrait\d*)?\.(webp|png|jpe?g)$/i;
const IMAGE_EXT_RE = /\.(webp|png|jpe?g)$/i;

async function walk(dir, matcher) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath, matcher)));
    } else if (entry.isFile() && matcher(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function toRelative(filePath) {
  return path.relative(process.cwd(), filePath);
}

function isAudioFile(name) {
  return name.endsWith('.m4a');
}

function isImageFile(name) {
  return IMAGE_EXT_RE.test(name);
}

async function checkAudio() {
  const files = await walk(AUDIO_ROOT, isAudioFile);
  const unhashed = files.filter((filePath) => !AUDIO_HASH_RE.test(filePath));
  return unhashed.map(toRelative);
}

async function checkImages() {
  const coverFiles = await walk(COVERS_ROOT, isImageFile);
  const backgroundFiles = await walk(BACKGROUNDS_ROOT, isImageFile);
  const files = [...coverFiles, ...backgroundFiles];
  const unhashed = files.filter((filePath) => !IMAGE_HASH_RE.test(filePath));
  return unhashed.map(toRelative);
}

async function main() {
  const unhashedAudio = await checkAudio();
  const unhashedImages = await checkImages();

  const issues = [...unhashedAudio, ...unhashedImages];
  if (issues.length) {
    console.error('❌ Найдены файлы без хэша в имени:');
    for (const file of issues) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log('✅ Все медиа-файлы имеют content-hash в имени.');
}

main().catch((error) => {
  console.error('❌ Ошибка при проверке медиа:', error);
  process.exit(1);
});
