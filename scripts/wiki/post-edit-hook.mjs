#!/usr/bin/env node
// PostToolUse hook для Claude Code (локальный, не для облака).
// Читает JSON из stdin (tool_input от Claude), проверяет file_path и,
// если правился .docs/* или server/infrastructure/db/schema.ts, печатает напоминание в stderr.
// Не блокирует — exit 0 всегда.

import { readFileSync } from 'node:fs';

let payload = {};
try {
  const raw = readFileSync(0, 'utf8');
  payload = raw ? JSON.parse(raw) : {};
} catch {
  process.exit(0);
}

const input = payload.tool_input || {};
const paths = [];
if (input.file_path) paths.push(input.file_path);
if (Array.isArray(input.edits)) for (const e of input.edits) if (e?.file_path) paths.push(e.file_path);

// Принимаем и абсолютные (`/…/.docs/foo.md`), и относительные (`.docs/foo.md`).
const isDocs = (p) => p.startsWith('.docs/') || p.includes('/.docs/');
const isSchema = (p) =>
  p.endsWith('server/infrastructure/db/schema.ts') ||
  p.endsWith('/server/infrastructure/db/schema.ts');

const touched = paths.filter((p) => isDocs(p) || isSchema(p));
if (!touched.length) process.exit(0);

const lines = [];
lines.push('');
lines.push('🧠 [wiki] обнаружены изменения в архитектурных источниках:');
for (const p of touched) lines.push(`  • ${p}`);
lines.push('');
lines.push('   Не забудь:');
lines.push('     1) pnpm wiki:sync-docs  (pre-commit сделает автоматически)');
lines.push('     2) /wiki-ingest <file>  для содержательного обновления wiki-страниц');
lines.push('     3) /wiki-lint           проверить целостность');
lines.push('');

process.stderr.write(lines.join('\n') + '\n');
process.exit(0);
