#!/usr/bin/env node
// Health-check для project-wiki/.
// Проверки:
//   1. Битые [[wikilinks]] в wiki/*, index.md, log.md (ссылки на несуществующие страницы wiki/).
//   2. Страницы без YAML frontmatter.
//   3. updated в frontmatter < даты mtime источника (date-only сравнение).
//   4. Источники в raw/ без ingest (никто из wiki/ их не упоминает).
//   5. Рассинхрон index.md (счётчик total pages vs реальное число).
//   6. Orphan-страницы (нет входящих ссылок).
//   7. Placeholders — [[name]], для которого нет файла, но он ожидается (не ошибка, warning).
// Exit 1, если есть критические замечания (битые ссылки, рассинхрон).
// Warnings (stale, orphan, missing-ingest, placeholders) не валят exit code.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const WIKI_ROOT = join(ROOT, 'project-wiki');
const WIKI_DIR = join(WIKI_ROOT, 'wiki');
const RAW_DIR = join(WIKI_ROOT, 'raw');
const INDEX_MD = join(WIKI_ROOT, 'index.md');
const LOG_MD = join(WIKI_ROOT, 'log.md');

const ALWAYS_VALID = new Set(['log', 'index', 'README']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

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
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
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
  // Сначала вырезаем ```fenced``` блоки, потом `inline` — иначе примеры из доков попадают в выдачу.
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

// "YYYY-MM-DD" из ISO/Date — нормализованное сравнение, чтобы updated сегодня == mtime сегодня (не stale).
function toDateOnly(input) {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  if (typeof input === 'string') return input.slice(0, 10);
  return new Date(input).toISOString().slice(0, 10);
}

function main() {
  const errors = [];
  const warns = [];
  const placeholders = new Map(); // name → [where]
  const wikiPages = walkMd(WIKI_DIR);
  const pageNames = new Set(wikiPages.map((p) => stripExt(basename(p))));

  const linkedFiles = [...wikiPages];
  if (existsSync(INDEX_MD)) linkedFiles.push(INDEX_MD);
  if (existsSync(LOG_MD)) linkedFiles.push(LOG_MD);

  const inboundCount = new Map();
  for (const name of pageNames) inboundCount.set(name, 0);

  for (const page of linkedFiles) {
    const txt = readFileSync(page, 'utf8');
    const links = extractWikilinks(txt);
    const selfName = stripExt(basename(page));
    for (const target of links) {
      if (pageNames.has(target)) {
        if (selfName !== target) inboundCount.set(target, (inboundCount.get(target) || 0) + 1);
        continue;
      }
      if (ALWAYS_VALID.has(target)) continue;
      // Placeholder: ссылка на ожидаемую страницу, которой ещё нет.
      // В index.md/log.md это допустимо (warning), в wiki/* — ошибка.
      const isIndexOrLog = page === INDEX_MD || page === LOG_MD;
      if (isIndexOrLog) {
        const set = placeholders.get(target) || new Set();
        set.add(relative(ROOT, page));
        placeholders.set(target, set);
      } else {
        errors.push(`битая ссылка [[${target}]] в ${relative(ROOT, page)}`);
      }
    }
  }

  // === 2. Без frontmatter ===
  const pageFm = new Map();
  for (const page of wikiPages) {
    const txt = readFileSync(page, 'utf8');
    const fm = parseFrontmatter(txt);
    if (!fm) warns.push(`нет frontmatter: ${relative(ROOT, page)}`);
    pageFm.set(page, fm || {});
  }

  // === 3. updated старше mtime источника (date-only) ===
  for (const [page, fm] of pageFm) {
    const sources = Array.isArray(fm.sources) ? fm.sources : fm.sources ? [fm.sources] : [];
    if (!fm.updated || !sources.length) continue;
    if (!ISO_DATE.test(String(fm.updated))) {
      warns.push(`updated не в формате YYYY-MM-DD: ${relative(ROOT, page)} (${fm.updated})`);
      continue;
    }
    const updatedDay = toDateOnly(fm.updated);
    for (const src of sources) {
      const srcPath = join(WIKI_ROOT, src);
      if (!existsSync(srcPath)) {
        warns.push(`источник не найден: ${src} (в ${relative(ROOT, page)})`);
        continue;
      }
      const mtimeDay = toDateOnly(statSync(srcPath).mtime);
      if (mtimeDay > updatedDay) {
        warns.push(`STALE: ${relative(ROOT, page)} (updated ${updatedDay}) ← источник ${src} изменён ${mtimeDay}`);
      }
    }
  }

  // === 4. Источники без ingest ===
  if (existsSync(RAW_DIR)) {
    const allRaw = walkMd(RAW_DIR);
    const ingested = new Set();
    for (const fm of pageFm.values()) {
      const sources = Array.isArray(fm.sources) ? fm.sources : fm.sources ? [fm.sources] : [];
      for (const s of sources) ingested.add(s.replace(/^\/?/, ''));
    }
    for (const p of allRaw) {
      const rel = relative(WIKI_ROOT, p);
      if (!ingested.has(rel)) warns.push(`источник без ingest: ${rel}`);
    }
  }

  // === 5. Счётчик в index.md ===
  if (existsSync(INDEX_MD)) {
    const idx = readFileSync(INDEX_MD, 'utf8');
    const m = idx.match(/\*\*Total pages\*\*:\s*(\d+)/i) || idx.match(/Total pages\s*:\s*(\d+)/i);
    if (m) {
      const claimed = parseInt(m[1], 10);
      const real = wikiPages.length;
      if (claimed !== real) errors.push(`index.md: Total pages = ${claimed}, фактически ${real}`);
    } else {
      warns.push('index.md: нет поля "Total pages"');
    }
  } else {
    errors.push('нет project-wiki/index.md');
  }

  // === 6. Orphans ===
  for (const [name, cnt] of inboundCount) {
    if (cnt === 0 && !ALWAYS_VALID.has(name)) warns.push(`orphan: [[${name}]] — никто не ссылается`);
  }

  // === Отчёт ===
  const section = (title, arr, prefix) => {
    if (!arr.length) return;
    console.log(`\n${prefix} ${title} (${arr.length}):`);
    for (const m of arr) console.log(`  • ${m}`);
  };

  section('ОШИБКИ', errors, '❌');
  section('Предупреждения', warns, '⚠️');

  if (placeholders.size) {
    console.log(`\n🔗 Placeholders в index.md/log.md (${placeholders.size}) — упомянуты, файла нет:`);
    for (const [name, where] of placeholders) {
      console.log(`  • [[${name}]]  ← ${[...where].join(', ')}`);
    }
  }

  console.log(
    `\n[wiki:lint] страниц: ${wikiPages.length}, ошибок: ${errors.length}, предупреждений: ${warns.length}, placeholders: ${placeholders.size}`,
  );

  process.exit(errors.length ? 1 : 0);
}

main();
