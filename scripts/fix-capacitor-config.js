#!/usr/bin/env node
/**
 * Исправляет webDir в Android конфиге Capacitor после sync
 * В runtime конфиге должен быть "public", а не ".output/public"
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const androidConfigPath = join(
  process.cwd(),
  'android/app/src/main/assets/capacitor.config.json'
);

try {
  const config = JSON.parse(readFileSync(androidConfigPath, 'utf-8'));
  if (config.webDir === '.output/public') {
    config.webDir = 'public';
    writeFileSync(androidConfigPath, JSON.stringify(config, null, '\t') + '\n');
    console.log('✓ Fixed webDir in Android Capacitor config');
  }
} catch (error) {
  // Игнорируем если файл не найден (например, на первом запуске)
  if (error.code !== 'ENOENT') {
    console.warn('Warning: Could not fix Capacitor config:', error.message);
  }
}
