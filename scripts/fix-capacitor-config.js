#!/usr/bin/env node
/**
 * Нормализует platform runtime-конфиги Capacitor после `cap sync`:
 * - Android: webDir должен быть `public` (не `.output/public`)
 * - Android/iOS: server.url синхронизируется с CAPACITOR_SERVER_URL
 *   - если URL задан -> dev/live reload
 *   - если URL не задан -> prod-safe режим (server.url удаляется)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const CONFIG_TARGETS = [
  {
    name: 'Android',
    path: 'android/app/src/main/assets/capacitor.config.json',
    forceAndroidRuntimeDefaults: true,
    normalizeWebDir: true,
  },
  {
    name: 'iOS',
    path: 'ios/App/App/capacitor.config.json',
    forceAndroidRuntimeDefaults: false,
    normalizeWebDir: false,
  },
];

function normalizeServerUrlFromEnv() {
  const rawValue = process.env.CAPACITOR_SERVER_URL;
  if (rawValue === undefined) {
    return '';
  }

  const value = String(rawValue).trim();
  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http/https URLs are supported');
    }
    return value.replace(/\/+$/, '');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'invalid CAPACITOR_SERVER_URL';
    throw new Error(`Invalid CAPACITOR_SERVER_URL "${value}": ${message}`);
  }
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

function patchConfig(target, serverUrl) {
  const absolutePath = join(process.cwd(), target.path);
  const raw = readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const config = ensureObject(parsed);
  let changed = false;
  const currentServerConfig = ensureObject(config.server);

  // Для Android runtime webDir должен быть `public`.
  if (target.normalizeWebDir && config.webDir === '.output/public') {
    config.webDir = 'public';
    changed = true;
  }

  const serverConfig = ensureObject(config.server);
  if (serverUrl) {
    // Dev/live reload: явно фиксируем URL dev-сервера.
    const nextServerConfig = {
      ...serverConfig,
      url: serverUrl,
      androidScheme: 'http',
      cleartext: true,
    };
    if (
      JSON.stringify(currentServerConfig) !== JSON.stringify(nextServerConfig)
    ) {
      config.server = nextServerConfig;
      changed = true;
    }
  } else {
    // Prod-safe: URL dev-сервера должен быть удалён.
    const hadUrl =
      typeof serverConfig.url === 'string' &&
      serverConfig.url.trim().length > 0;
    if (hadUrl) {
      delete serverConfig.url;
      changed = true;
    }

    // Для Android оставляем runtime-параметры, чтобы поведение не менялось.
    if (target.forceAndroidRuntimeDefaults) {
      const nextServerConfig = {
        ...serverConfig,
        androidScheme: 'http',
        cleartext: true,
      };
      if (
        JSON.stringify(currentServerConfig) !== JSON.stringify(nextServerConfig)
      ) {
        config.server = nextServerConfig;
        changed = true;
      }
    } else if (hadUrl) {
      config.server = serverConfig;
    }
  }

  if (changed) {
    writeFileSync(absolutePath, `${JSON.stringify(config, null, '\t')}\n`);
  }

  return { changed, absolutePath };
}

function main() {
  const serverUrl = normalizeServerUrlFromEnv();
  const prodSafeMode = !serverUrl;

  for (const target of CONFIG_TARGETS) {
    try {
      const result = patchConfig(target, serverUrl);
      if (!result.changed) {
        console.log(`• ${target.name}: no changes`);
        continue;
      }

      console.log(`✓ ${target.name}: patched ${result.absolutePath}`);
      if (serverUrl) {
        console.log(`  - server.url: ${serverUrl}`);
      } else if (prodSafeMode) {
        console.log('  - server.url removed (prod-safe mode)');
      }
    } catch (error) {
      // На первом запуске один из runtime-файлов может отсутствовать.
      if (error && error.code === 'ENOENT') {
        console.log(`• ${target.name}: config not found, skipped`);
        continue;
      }
      throw error;
    }
  }
}

main();
