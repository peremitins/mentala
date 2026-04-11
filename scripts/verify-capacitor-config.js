#!/usr/bin/env node
/**
 * Проверяет, что runtime конфиги Capacitor находятся в prod-safe состоянии:
 * в них не должно быть server.url, а release bundle должен совпадать
 * с ожидаемыми public env значениями.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

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

const HTML_BUNDLE_TARGETS = [
  {
    name: 'iOS bundle',
    path: 'ios/App/App/public/index.html',
  },
  {
    name: 'Android bundle',
    path: 'android/app/src/main/assets/public/index.html',
  },
];

const IOS_FORBIDDEN_PODS = ['FBAEMKit', 'FBSDKCoreKit', 'FBSDKLoginKit'];

function parseArgs(argv) {
  const options = {
    envFile: '.env.production',
    mode: 'release',
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

function readNuxtPublicConfigFromHtml(htmlPath) {
  const absolutePath = join(process.cwd(), htmlPath);
  const raw = readFileSync(absolutePath, 'utf8');
  const marker = 'window.__NUXT__.config=';
  const markerIndex = raw.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error(`Не найден window.__NUXT__.config в ${absolutePath}`);
  }

  const jsonStart = markerIndex + marker.length;
  const scriptEnd = raw.indexOf('</script>', jsonStart);

  if (scriptEnd < 0) {
    throw new Error(`Не найден конец script с Nuxt config в ${absolutePath}`);
  }

  const configLiteral = raw
    .slice(jsonStart, scriptEnd)
    .trim()
    .replace(/;$/, '');
  const parsed = Function(`"use strict"; return (${configLiteral});`)();

  return {
    absolutePath,
    publicConfig:
      parsed && typeof parsed === 'object' && parsed.public
        ? parsed.public
        : {},
  };
}

function verifyReleaseBundleAgainstEnv(envFile) {
  const { absolutePath: envPath, values: env } = loadEnvFile(envFile);
  const expected = {
    apiBase: normalizeEnvValue(env.NUXT_PUBLIC_API_SERVER_URL),
    appUrl: normalizeEnvValue(env.NUXT_PRIVATE_API_BASE),
    googleWebClientId: normalizeEnvValue(env.NUXT_OAUTH_GOOGLE_CLIENT_ID),
    googleIosClientId: normalizeEnvValue(env.NUXT_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  };

  const mismatches = [];

  for (const target of HTML_BUNDLE_TARGETS) {
    const absolutePath = join(process.cwd(), target.path);

    if (!existsSync(absolutePath)) {
      console.log(`• ${target.name}: bundle not found, skipped`);
      continue;
    }

    const { publicConfig } = readNuxtPublicConfigFromHtml(target.path);
    const actual = {
      apiBase: normalizeEnvValue(publicConfig.apiBase),
      appUrl: normalizeEnvValue(publicConfig.appUrl),
      googleWebClientId: normalizeEnvValue(publicConfig.googleWebClientId),
      googleIosClientId: normalizeEnvValue(publicConfig.googleIosClientId),
    };

    for (const [key, expectedValue] of Object.entries(expected)) {
      const actualValue = actual[key];

      if (!expectedValue) {
        mismatches.push({
          target: target.name,
          path: absolutePath,
          key,
          expected: '<empty env>',
          actual: actualValue || '<empty bundle>',
        });
        continue;
      }

      if (actualValue !== expectedValue) {
        mismatches.push({
          target: target.name,
          path: absolutePath,
          key,
          expected: expectedValue,
          actual: actualValue || '<empty bundle>',
        });
      }
    }

    if (
      !Object.entries(expected).some(([key, expectedValue]) => {
        return expectedValue !== actual[key];
      })
    ) {
      console.log(`✓ ${target.name}: public runtime config matches ${envPath}`);
    }
  }

  if (!mismatches.length) {
    return;
  }

  console.error('\n❌ Release bundle does not match expected env values:');
  for (const item of mismatches) {
    console.error(
      `- ${item.target}: ${item.key} mismatch in ${item.path}\n  expected: ${item.expected}\n  actual:   ${item.actual}`
    );
  }
  console.error(
    '\nFix: rerun `pnpm cap:sync` after updating .env.production and before Xcode Archive.'
  );
  process.exit(1);
}

function getServerUrl(config) {
  if (!config || typeof config !== 'object') return '';
  const server = config.server;
  if (!server || typeof server !== 'object') return '';
  const url = server.url;
  if (typeof url !== 'string') return '';
  return url.trim();
}

function verifyIosForbiddenPodsAbsent() {
  const podfileLockPath = join(process.cwd(), 'ios/App/Podfile.lock');

  if (!existsSync(podfileLockPath)) {
    console.log('• iOS Podfile.lock not found, forbidden pod check skipped');
    return;
  }

  const podfileLock = readFileSync(podfileLockPath, 'utf8');
  const foundPods = IOS_FORBIDDEN_PODS.filter((podName) =>
    podfileLock.includes(podName)
  );

  if (!foundPods.length) {
    console.log('✓ iOS Podfile.lock: no forbidden Facebook ad-related pods');
    return;
  }

  console.error('\n❌ Forbidden iOS pods detected in Podfile.lock:');
  for (const podName of foundPods) {
    console.error(`- ${podName}`);
  }
  console.error(
    '\nFix: rerun `pnpm cap:sync:prod` and confirm @capgo/capacitor-social-login podspec was stripped before Xcode Archive.'
  );
  process.exit(1);
}

function main() {
  const { envFile, mode } = parseArgs(process.argv.slice(2));
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
  } else {
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

  if (mode === 'release') {
    verifyReleaseBundleAgainstEnv(envFile);
    verifyIosForbiddenPodsAbsent();
  }
}

main();
