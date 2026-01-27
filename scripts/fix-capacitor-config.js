#!/usr/bin/env node
/**
 * Исправляет webDir и server.url в Android конфиге Capacitor после sync
 * В runtime конфиге должен быть "public", а не ".output/public"
 * server.url должен соответствовать CAPACITOR_SERVER_URL
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const androidConfigPath = join(
  process.cwd(),
  'android/app/src/main/assets/capacitor.config.json'
);

try {
  const config = JSON.parse(readFileSync(androidConfigPath, 'utf-8'));
  let changed = false;

  // Исправляем webDir
  if (config.webDir === '.output/public') {
    config.webDir = 'public';
    changed = true;
  }

  // Обновляем server.url из переменной окружения
  const serverUrl = process.env.CAPACITOR_SERVER_URL;
  if (serverUrl !== undefined) {
    if (serverUrl) {
      // Если URL указан - настраиваем dev-сервер
      config.server = {
        url: serverUrl,
        androidScheme: 'http',
        cleartext: true,
      };
      changed = true;
    } else {
      // Если пусто - production (без server.url, только androidScheme)
      config.server = {
        androidScheme: 'http',
        cleartext: true,
      };
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(androidConfigPath, JSON.stringify(config, null, '\t') + '\n');
    console.log('✓ Fixed Android Capacitor config');
    if (serverUrl) {
      console.log(`  - server.url: ${serverUrl}`);
    }
  }
} catch (error) {
  // Игнорируем если файл не найден (например, на первом запуске)
  if (error.code !== 'ENOENT') {
    console.warn('Warning: Could not fix Capacitor config:', error.message);
  }
}
