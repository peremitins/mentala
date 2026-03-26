#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const INFO_PLIST_PATH = 'ios/App/App/Info.plist';
const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const GOOGLE_URL_SCHEME_PREFIX = 'com.googleusercontent.apps.';

function parseArgs(argv) {
  const options = {
    envFile: '.env.development',
    mode: 'development',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--env-file') {
      options.envFile = argv[index + 1] || options.envFile;
      index += 1;
      continue;
    }

    if (token === '--mode') {
      options.mode = argv[index + 1] || options.mode;
      index += 1;
    }
  }

  return options;
}

function normalizeEnvValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function loadEnvFile(envFile) {
  const absolutePath = resolve(process.cwd(), envFile);

  if (!existsSync(absolutePath)) {
    throw new Error(`Файл окружения не найден: ${absolutePath}`);
  }

  const raw = readFileSync(absolutePath, 'utf8');
  return {
    absolutePath,
    values: dotenv.parse(raw),
  };
}

function requireEnvValue(name, env, envFileLabel) {
  const value = normalizeEnvValue(env[name]);
  if (!value) {
    throw new Error(
      `В релизном окружении отсутствует обязательная переменная ${name}. Обнови ${envFileLabel} до сборки TestFlight.`
    );
  }
  return value;
}

function assertPublicUrl(name, value) {
  const normalized = normalizeEnvValue(value);

  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error(
      `${name} должен начинаться с http:// или https://. Сейчас: "${normalized || '<empty>'}".`
    );
  }

  if (
    /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(normalized)
  ) {
    throw new Error(
      `${name} не должен указывать на localhost/127.0.0.1 для release-сборки. Сейчас: "${normalized}".`
    );
  }
}

function buildGoogleUrlScheme(iosClientId) {
  const normalized = normalizeEnvValue(iosClientId);

  if (!normalized.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    throw new Error(
      `NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID должен заканчиваться на ${GOOGLE_CLIENT_ID_SUFFIX}. Сейчас: "${normalized || '<empty>'}".`
    );
  }

  const clientCore = normalized.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length);
  return `${GOOGLE_URL_SCHEME_PREFIX}${clientCore}`;
}

function readInfoPlist(plistPath) {
  const absolutePath = resolve(process.cwd(), plistPath);
  const rawJson = execFileSync(
    'plutil',
    ['-convert', 'json', '-o', '-', absolutePath],
    {
      encoding: 'utf8',
    }
  );

  return {
    absolutePath,
    data: JSON.parse(rawJson),
  };
}

function findGoogleUrlTypeIndex(plistData) {
  const urlTypes = Array.isArray(plistData.CFBundleURLTypes)
    ? plistData.CFBundleURLTypes
    : [];

  return urlTypes.findIndex((entry) => {
    const schemes = Array.isArray(entry?.CFBundleURLSchemes)
      ? entry.CFBundleURLSchemes
      : [];

    return schemes.some(
      (scheme) =>
        typeof scheme === 'string' &&
        scheme.startsWith(GOOGLE_URL_SCHEME_PREFIX)
    );
  });
}

function updateInfoPlistGoogleScheme(plistPath, nextScheme) {
  const { absolutePath, data } = readInfoPlist(plistPath);
  const googleUrlTypeIndex = findGoogleUrlTypeIndex(data);

  if (googleUrlTypeIndex < 0) {
    throw new Error(
      `В ${absolutePath} не найден Google URL scheme entry в CFBundleURLTypes.`
    );
  }

  const currentScheme = normalizeEnvValue(
    data.CFBundleURLTypes?.[googleUrlTypeIndex]?.CFBundleURLSchemes?.[0]
  );

  if (currentScheme === nextScheme) {
    console.log(
      `✓ iOS Google URL scheme уже синхронизирован: ${currentScheme || '<empty>'}`
    );
    return;
  }

  execFileSync(
    '/usr/libexec/PlistBuddy',
    [
      '-c',
      `Set :CFBundleURLTypes:${googleUrlTypeIndex}:CFBundleURLSchemes:0 ${nextScheme}`,
      absolutePath,
    ],
    {
      stdio: 'pipe',
    }
  );

  console.log(
    `✓ Обновлён iOS Google URL scheme: ${currentScheme || '<empty>'} -> ${nextScheme}`
  );
}

function main() {
  const { envFile, mode } = parseArgs(process.argv.slice(2));
  const { absolutePath: envPath, values: env } = loadEnvFile(envFile);

  console.log(`ℹ️  Синхронизация mobile OAuth из ${envPath} (${mode})`);

  if (mode === 'release') {
    const publicApiBase = requireEnvValue(
      'NUXT_PUBLIC_API_SERVER_URL',
      env,
      envPath
    );
    const appUrl = requireEnvValue('NUXT_PRIVATE_API_BASE', env, envPath);
    requireEnvValue('NUXT_OAUTH_GOOGLE_CLIENT_ID', env, envPath);
    requireEnvValue('NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID', env, envPath);

    // Для TestFlight нельзя утащить localhost или пустые URL в статический bundle.
    assertPublicUrl('NUXT_PUBLIC_API_SERVER_URL', publicApiBase);
    assertPublicUrl('NUXT_PRIVATE_API_BASE', appUrl);
  }

  const iosClientId = normalizeEnvValue(env.NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID);

  if (!iosClientId) {
    if (mode === 'release') {
      throw new Error(
        `Для release-сборки требуется NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID, но в ${envPath} он пустой.`
      );
    }

    console.warn(
      '⚠️  NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID не задан. Синхронизацию Info.plist пропускаю.'
    );
    return;
  }

  const nextGoogleScheme = buildGoogleUrlScheme(iosClientId);
  updateInfoPlistGoogleScheme(INFO_PLIST_PATH, nextGoogleScheme);
}

main();
