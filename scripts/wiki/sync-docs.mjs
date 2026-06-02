#!/usr/bin/env node
// Синхронизация .docs/ → project-wiki/raw/docs/ (рекурсивно) +
// корневых CLAUDE.md и AGENTS.md → project-wiki/raw/.
// Сохраняет immutable snapshot источников для LLM Wiki.
// Печатает diff (added/updated/removed), exit 0 при любом исходе.

import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, unlinkSync, existsSync, rmdirSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SRC_DOCS = join(ROOT, '.docs');
const DST_DOCS = join(ROOT, 'project-wiki/raw/docs');
const DST_RAW = join(ROOT, 'project-wiki/raw');

// Корневые файлы, которые тоже считаются источниками знания.
// Sync: src → dst (одиночные файлы, не каталоги).
const ROOT_FILES = [
  { src: join(ROOT, 'CLAUDE.md'), dst: join(DST_RAW, 'CLAUDE.md') },
  { src: join(ROOT, 'AGENTS.md'), dst: join(DST_RAW, 'AGENTS.md') },
];

const hash = (s) => createHash('sha1').update(s).digest('hex');

function walkMdRelative(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkMdRelative(p, base));
    else if (name.endsWith('.md')) out.push(relative(base, p));
  }
  return out;
}

function emptyDirsBottomUp(root) {
  // Удаляем пустые поддиректории, чтобы не оставались осиротевшие папки.
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    if (statSync(p).isDirectory()) {
      emptyDirsBottomUp(p);
      if (readdirSync(p).length === 0) rmdirSync(p);
    }
  }
}

function syncDir(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  const srcRel = new Set(walkMdRelative(srcDir));
  const dstRel = new Set(walkMdRelative(dstDir));

  const added = [];
  const updated = [];
  const removed = [];

  for (const rel of srcRel) {
    const sp = join(srcDir, rel);
    const dp = join(dstDir, rel);
    const sc = readFileSync(sp, 'utf8');
    if (!dstRel.has(rel)) {
      mkdirSync(dirname(dp), { recursive: true });
      writeFileSync(dp, sc);
      added.push(rel);
      continue;
    }
    const dc = readFileSync(dp, 'utf8');
    if (hash(sc) !== hash(dc)) {
      writeFileSync(dp, sc);
      updated.push(rel);
    }
  }

  for (const rel of dstRel) {
    if (!srcRel.has(rel)) {
      unlinkSync(join(dstDir, rel));
      removed.push(rel);
    }
  }

  emptyDirsBottomUp(dstDir);
  return { added, updated, removed };
}

function syncFiles(pairs) {
  const added = [];
  const updated = [];
  const removed = [];
  for (const { src, dst } of pairs) {
    const dstExists = existsSync(dst);
    if (!existsSync(src)) {
      if (dstExists) {
        unlinkSync(dst);
        removed.push(relative(ROOT, dst));
      }
      continue;
    }
    const sc = readFileSync(src, 'utf8');
    if (!dstExists) {
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, sc);
      added.push(relative(ROOT, dst));
      continue;
    }
    const dc = readFileSync(dst, 'utf8');
    if (hash(sc) !== hash(dc)) {
      writeFileSync(dst, sc);
      updated.push(relative(ROOT, dst));
    }
  }
  return { added, updated, removed };
}

function main() {
  if (!existsSync(SRC_DOCS)) {
    console.error(`[wiki:sync-docs] нет директории ${SRC_DOCS}`);
    process.exit(1);
  }

  const docs = syncDir(SRC_DOCS, DST_DOCS);
  const root = syncFiles(ROOT_FILES);

  const added = [...docs.added.map((r) => `docs/${r}`), ...root.added];
  const updated = [...docs.updated.map((r) => `docs/${r}`), ...root.updated];
  const removed = [...docs.removed.map((r) => `docs/${r}`), ...root.removed];

  const print = (label, arr, icon) => {
    if (!arr.length) return;
    console.log(`\n${icon} ${label} (${arr.length}):`);
    for (const f of arr) console.log(`  ${f}`);
  };

  if (!added.length && !updated.length && !removed.length) {
    console.log('[wiki:sync-docs] raw уже в синхроне с источниками');
    return;
  }

  print('Added', added, '➕');
  print('Updated', updated, '✏️');
  print('Removed', removed, '🗑️');

  console.log(`\n[wiki:sync-docs] всего: +${added.length} ~${updated.length} -${removed.length}`);
  console.log('💡 не забудь обновить wiki-страницы для изменённых источников (см. pnpm wiki:status).');
}

main();
