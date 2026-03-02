#!/usr/bin/env node
/**
 * Проверяет, что runtime конфиги Capacitor находятся в prod-safe состоянии:
 * в них не должно быть server.url.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const CONFIG_TARGETS = [
  {
    name: 'Android',
    path: 'android/app/src/main/assets/capacitor.config.json',
  },
  {
    name: 'iOS',
    path: 'ios/App/App/capacitor.config.json',
  },
];

function getServerUrl(config) {
  if (!config || typeof config !== 'object') return '';
  const server = config.server;
  if (!server || typeof server !== 'object') return '';
  const url = server.url;
  if (typeof url !== 'string') return '';
  return url.trim();
}

function main() {
  const violations = [];

  for (const target of CONFIG_TARGETS) {
    const absolutePath = join(process.cwd(), target.path);

    try {
      const raw = readFileSync(absolutePath, 'utf-8');
      const config = JSON.parse(raw);
      const serverUrl = getServerUrl(config);

      if (!serverUrl) {
        console.log(`✓ ${target.name}: no server.url`);
        continue;
      }

      violations.push({
        platform: target.name,
        path: absolutePath,
        url: serverUrl,
      });
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        console.log(`• ${target.name}: config not found, skipped`);
        continue;
      }

      throw error;
    }
  }

  if (!violations.length) {
    console.log('✓ Capacitor runtime configs are prod-safe');
    return;
  }

  console.error('\n❌ Unsafe Capacitor runtime config detected:');
  for (const item of violations) {
    console.error(
      `- ${item.platform}: ${item.path} contains server.url="${item.url}"`
    );
  }
  console.error(
    '\nFix: run `pnpm cap:sync:prod` before release build/publish flows.'
  );
  process.exit(1);
}

main();
