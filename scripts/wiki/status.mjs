#!/usr/bin/env node
// Краткий статус wiki для агентов и человека.
// Печатает: сколько источников отстаёт, сколько ingest, сколько stale, placeholders, рекомендации.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const WIKI_ROOT = join(ROOT, 'project-wiki');
const WIKI_DIR = join(WIKI_ROOT, 'wiki');
const RAW_DIR = join(WIKI_ROOT, 'raw');
const RAW_DOCS = join(RAW_DIR, 'docs');
const DOCS = join(ROOT, '.docs');
const INDEX_MD = join(WIKI_ROOT, 'index.md');
const LOG_MD = join(WIKI_ROOT, 'log.md');

const ALWAYS_VALID = new Set(['log', 'index', 'README']);

function walkMd(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkMd(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return {};
  const end = text.indexOf('\n---', 4);
  if (end < 0) return {};
  const raw = text.slice(4, end);
  const fm = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    fm[m[1]] = v;
  }
  return fm;
}

const stripExt = (s) => s.replace(/\.md$/i, '');

function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '');
}

function extractWikilinks(text) {
  const out = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let m;
  const clean = stripCode(text);
  while ((m = re.exec(clean)) !== null) out.push(m[1].trim());
  return out;
}

const toDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

function main() {
  const docsAll = walkMd(DOCS);
  const docsTop = existsSync(DOCS) ? readdirSync(DOCS).filter((f) => f.endsWith('.md')) : [];
  const rawAll = walkMd(RAW_DIR);
  const rawDocsAll = walkMd(RAW_DOCS);
  const wikiPages = walkMd(WIKI_DIR);

  // Сравнение .docs (рекурсивно) ↔ raw/docs (рекурсивно)
  const docsRel = new Set(docsAll.map((p) => relative(DOCS, p)));
  const rawDocsRel = new Set(rawDocsAll.map((p) => relative(RAW_DOCS, p)));
  const docsNotInRaw = [...docsRel].filter((f) => !rawDocsRel.has(f));
  const rawNotInDocs = [...rawDocsRel].filter((f) => !docsRel.has(f));

  // Ingested = что упомянуто в sources хотя бы одной wiki-страницы.
  const ingested = new Set();
  const stalePages = [];
  for (const p of wikiPages) {
    const fm = parseFrontmatter(readFileSync(p, 'utf8'));
    const sources = Array.isArray(fm.sources) ? fm.sources : fm.sources ? [fm.sources] : [];
    for (const s of sources) ingested.add(s.replace(/^\/?/, ''));

    if (!fm.updated) continue;
    const upd = toDay(fm.updated);
    for (const s of sources) {
      const sp = join(WIKI_ROOT, s);
      if (existsSync(sp) && toDay(statSync(sp).mtime) > upd) {
        stalePages.push(relative(ROOT, p));
        break;
      }
    }
  }
  const notIngested = rawAll
    .map((p) => relative(WIKI_ROOT, p))
    .filter((rel) => !ingested.has(rel));

  // Placeholders: [[name]] в index.md/log.md, файла нет.
  const pageNames = new Set(wikiPages.map((p) => stripExt(basename(p))));
  const placeholderSet = new Set();
  for (const f of [INDEX_MD, LOG_MD]) {
    if (!existsSync(f)) continue;
    for (const target of extractWikilinks(readFileSync(f, 'utf8'))) {
      if (!pageNames.has(target) && !ALWAYS_VALID.has(target)) placeholderSet.add(target);
    }
  }
  const placeholders = [...placeholderSet].sort();

  console.log('=== project-wiki / status ===');
  console.log(`.docs/                : ${docsAll.length} файлов (top-level: ${docsTop.length})`);
  console.log(`project-wiki/raw      : ${rawAll.length} файлов`);
  console.log(`project-wiki/wiki     : ${wikiPages.length} страниц`);

  const block = (title, arr) => {
    console.log(`\n${title} (${arr.length})`);
    if (!arr.length) {
      console.log('  ✓ чисто');
      return;
    }
    for (const f of arr) console.log(`  • ${f}`);
  };

  block('🆕 в .docs, нет в raw/docs (нужно sync)', docsNotInRaw);
  block('🗑️ в raw/docs, нет в .docs (sync почистит)', rawNotInDocs);
  block('📥 источники без ingest', notIngested);
  block('⏰ stale wiki-страницы (источник новее, по дате)', stalePages);
  block('🔗 placeholders (упомянуты в index/log, страницы нет)', placeholders);

  console.log('\nДальше:');
  if (docsNotInRaw.length || rawNotInDocs.length) console.log('  → pnpm wiki:sync-docs');
  if (notIngested.length) console.log('  → /wiki-ingest <файл>  (для каждого из «источники без ingest»)');
  if (stalePages.length) console.log('  → обнови устаревшие страницы вручную и подправь frontmatter `updated:`');
  if (placeholders.length) console.log('  → /wiki-ingest нужного источника, чтобы заполнить placeholder, или убери ссылку');
  if (!docsNotInRaw.length && !rawNotInDocs.length && !notIngested.length && !stalePages.length && !placeholders.length) {
    console.log('  ✓ wiki полностью синхронизирована');
  }
}

main();
