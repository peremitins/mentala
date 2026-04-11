#!/usr/bin/env node
/**
 * Для Mentala на iOS используется только Google Sign-In.
 * У некоторых версий @capgo/capacitor-social-login Facebook pods
 * остаются в podspec даже при facebook: false, из-за чего App Review
 * может классифицировать сборку как advertising-enabled.
 *
 * Этот скрипт жёстко вырезает ad-related Facebook зависимости
 * из podspec перед `npx cap update`, чтобы они не попали в Podfile.lock.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

const IOS_PODSPEC_REPLACEMENTS = [
  {
    pattern: /^(\s*)s\.dependency\s+'FBSDKCoreKit',\s*'18\.0\.0'\s*$/m,
    replacement:
      "$1# s.dependency 'FBSDKCoreKit', '18.0.0'  # Disabled in Mentala: Google-only iOS auth",
  },
  {
    pattern: /^(\s*)s\.dependency\s+'FBSDKLoginKit',\s*'18\.0\.0'\s*$/m,
    replacement:
      "$1# s.dependency 'FBSDKLoginKit', '18.0.0'  # Disabled in Mentala: Google-only iOS auth",
  },
  {
    pattern: /^(\s*)#\s*s\.dependency\s+'FBSDKCoreKit',\s*'18\.0\.0'.*$/m,
    replacement:
      "$1# s.dependency 'FBSDKCoreKit', '18.0.0'  # Disabled in Mentala: Google-only iOS auth",
  },
  {
    pattern: /^(\s*)#\s*s\.dependency\s+'FBSDKLoginKit',\s*'18\.0\.0'.*$/m,
    replacement:
      "$1# s.dependency 'FBSDKLoginKit', '18.0.0'  # Disabled in Mentala: Google-only iOS auth",
  },
];

function resolvePodspecPath() {
  const packageJsonPath = require.resolve(
    '@capgo/capacitor-social-login/package.json'
  );

  return join(dirname(packageJsonPath), 'CapgoCapacitorSocialLogin.podspec');
}

function main() {
  const podspecPath = resolvePodspecPath();

  if (!existsSync(podspecPath)) {
    console.warn(
      `[strip-ios-social-login-ads-sdk] Podspec not found: ${podspecPath}`
    );
    process.exit(0);
  }

  const originalContent = readFileSync(podspecPath, 'utf8');
  let nextContent = originalContent;

  for (const { pattern, replacement } of IOS_PODSPEC_REPLACEMENTS) {
    nextContent = nextContent.replace(pattern, replacement);
  }

  if (nextContent === originalContent) {
    console.log(
      '[strip-ios-social-login-ads-sdk] Podspec already stripped from Facebook SDK dependencies'
    );
    return;
  }

  writeFileSync(podspecPath, nextContent, 'utf8');
  console.log(
    '[strip-ios-social-login-ads-sdk] Removed Facebook SDK pods from iOS social-login podspec'
  );
}

main();
