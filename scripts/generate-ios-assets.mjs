#!/usr/bin/env node

/**
 * Генерирует iOS-ассеты из Apple-safe бренд-мастера.
 *
 * Источник:
 * - public/app-icon-native-master.svg — мастер для native iOS/AppIcon
 *
 * Результат:
 * - ios/App/App/Assets.xcassets/AppIcon.appiconset/favicon_ios.png
 * - ios/App/App/Assets.xcassets/SplashBackdrop.imageset/splash-backdrop*.png
 * - ios/App/App/Assets.xcassets/SplashMark.imageset/splash-mark*.png
 */
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import {
  PNG_OUTPUT_OPTIONS,
  renderLauncherBitmap,
  stripBackgroundFromMasterSvg,
} from './lib/native-brand-assets.mjs';

const ROOT_DIR = process.cwd();
const IOS_ICON_MASTER_PATH = path.join(
  ROOT_DIR,
  'public/app-icon-native-master.svg'
);
const IOS_APP_ICON_PATH = path.join(
  ROOT_DIR,
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/favicon_ios.png'
);
const IOS_SPLASH_BACKDROP_DIR = path.join(
  ROOT_DIR,
  'ios/App/App/Assets.xcassets/SplashBackdrop.imageset'
);
const IOS_SPLASH_MARK_DIR = path.join(
  ROOT_DIR,
  'ios/App/App/Assets.xcassets/SplashMark.imageset'
);

const APP_ICON_SIZE = 1024;
const IOS_APP_ICON_MARK_SCALE = 0.94;
const SPLASH_SIZE = 2732;
const SPLASH_MARK_SIZE = 560;
const SPLASH_MARK_ASSET_SIZE = 1024;
const SPLASH_BACKDROP_TARGETS = [
  'splash-backdrop.png',
  'splash-backdrop-1.png',
  'splash-backdrop-2.png',
];
const SPLASH_MARK_TARGETS = [
  'splash-mark.png',
  'splash-mark-1.png',
  'splash-mark-2.png',
];

function createSplashBackdropSvg(size) {
  return `
    <svg
      width="${size}"
      height="${size}"
      viewBox="0 0 ${size} ${size}"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-fill" x1="${size * 0.16}" y1="${size * 0.06}" x2="${size * 0.87}" y2="${size * 0.95}" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0E1322" />
          <stop offset="0.52" stop-color="#090D18" />
          <stop offset="1" stop-color="#070A12" />
        </linearGradient>

        <radialGradient id="bg-top-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${size * 0.34} ${size * 0.22}) rotate(33) scale(${size * 0.34} ${size * 0.22})">
          <stop stop-color="#63B8FF" stop-opacity="0.24" />
          <stop offset="0.55" stop-color="#63B8FF" stop-opacity="0.09" />
          <stop offset="1" stop-color="#63B8FF" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="bg-bottom-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${size * 0.73} ${size * 0.8}) rotate(149) scale(${size * 0.3} ${size * 0.22})">
          <stop stop-color="#8E71FF" stop-opacity="0.22" />
          <stop offset="0.56" stop-color="#8E71FF" stop-opacity="0.08" />
          <stop offset="1" stop-color="#8E71FF" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="bg-center-haze" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${size * 0.5} ${size * 0.5}) rotate(90) scale(${size * 0.24} ${size * 0.24})">
          <stop stop-color="#FFFFFF" stop-opacity="0.085" />
          <stop offset="0.58" stop-color="#FFFFFF" stop-opacity="0.028" />
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect width="${size}" height="${size}" fill="url(#bg-fill)" />
      <rect width="${size}" height="${size}" fill="url(#bg-top-glow)" />
      <rect width="${size}" height="${size}" fill="url(#bg-bottom-glow)" />
      <rect width="${size}" height="${size}" fill="url(#bg-center-haze)" />
    </svg>
  `;
}

/**
 * iOS AppIcon собираем той же светлой launcher-композицией, что и Android,
 * но без alpha-канала, чтобы Xcode/App Store не получили прозрачную иконку.
 */
async function renderAppIcon(markSvg) {
  const appIconBuffer = await renderLauncherBitmap(markSvg, APP_ICON_SIZE, {
    // На iPhone итоговая маска и визуальные поля читаются строже, чем на Android.
    // Чуть увеличиваем знак, чтобы иконка выглядела ближе к Android launcher.
    markScale: IOS_APP_ICON_MARK_SCALE,
    removeAlpha: true,
  });

  await writeFile(IOS_APP_ICON_PATH, appIconBuffer);
}

async function renderSplash(markSvg) {
  const splashBackdropBuffer = await sharp(
    Buffer.from(createSplashBackdropSvg(SPLASH_SIZE))
  )
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();

  const splashMarkBuffer = await sharp(Buffer.from(markSvg))
    .resize(SPLASH_MARK_SIZE, SPLASH_MARK_SIZE, {
      fit: 'contain',
    })
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();

  await mkdir(IOS_SPLASH_BACKDROP_DIR, { recursive: true });
  await Promise.all(
    SPLASH_BACKDROP_TARGETS.map((filename) =>
      writeFile(
        path.join(IOS_SPLASH_BACKDROP_DIR, filename),
        splashBackdropBuffer
      )
    )
  );

  const splashMarkAssetBuffer = await sharp(Buffer.from(markSvg))
    .resize(SPLASH_MARK_ASSET_SIZE, SPLASH_MARK_ASSET_SIZE, {
      fit: 'contain',
    })
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();

  await mkdir(IOS_SPLASH_MARK_DIR, { recursive: true });
  await Promise.all(
    SPLASH_MARK_TARGETS.map((filename) =>
      writeFile(path.join(IOS_SPLASH_MARK_DIR, filename), splashMarkAssetBuffer)
    )
  );
}

async function main() {
  const masterSvg = await readFile(IOS_ICON_MASTER_PATH, 'utf8');
  const markSvg = stripBackgroundFromMasterSvg(masterSvg);

  await renderAppIcon(markSvg);
  await renderSplash(markSvg);
}

await main();
