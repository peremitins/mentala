#!/usr/bin/env node

/**
 * Генерирует Android launcher icons и splash screen из бренд-мастера.
 *
 * Источник:
 * - public/app-icon-native-master.svg — мастер для native launcher icon
 *
 * Результат:
 * - adaptive icon foreground/background в mipmap-*
 * - bitmap fallback icons в mipmap-*
 * - splash screen assets в drawable* / drawable-port-* / drawable-land-*
 */
import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const ROOT_DIR = process.cwd();
const ANDROID_ICON_MASTER_PATH = path.join(
  ROOT_DIR,
  'public/app-icon-native-master.svg'
);
const ANDROID_RES_DIR = path.join(ROOT_DIR, 'android/app/src/main/res');

const ICON_BITMAP_TARGETS = [
  { dir: 'mipmap-mdpi', size: 48 },
  { dir: 'mipmap-hdpi', size: 72 },
  { dir: 'mipmap-xhdpi', size: 96 },
  { dir: 'mipmap-xxhdpi', size: 144 },
  { dir: 'mipmap-xxxhdpi', size: 192 },
];

const ADAPTIVE_LAYER_TARGETS = [
  { dir: 'mipmap-mdpi', size: 108 },
  { dir: 'mipmap-hdpi', size: 162 },
  { dir: 'mipmap-xhdpi', size: 216 },
  { dir: 'mipmap-xxhdpi', size: 324 },
  { dir: 'mipmap-xxxhdpi', size: 432 },
];

const SPLASH_TARGETS = [
  { path: 'drawable/splash.png', width: 480, height: 320 },
  { path: 'drawable-port-mdpi/splash.png', width: 320, height: 480 },
  { path: 'drawable-port-hdpi/splash.png', width: 480, height: 800 },
  { path: 'drawable-port-xhdpi/splash.png', width: 720, height: 1280 },
  { path: 'drawable-port-xxhdpi/splash.png', width: 960, height: 1600 },
  { path: 'drawable-port-xxxhdpi/splash.png', width: 1280, height: 1920 },
  { path: 'drawable-land-mdpi/splash.png', width: 480, height: 320 },
  { path: 'drawable-land-hdpi/splash.png', width: 800, height: 480 },
  { path: 'drawable-land-xhdpi/splash.png', width: 1280, height: 720 },
  { path: 'drawable-land-xxhdpi/splash.png', width: 1600, height: 960 },
  { path: 'drawable-land-xxxhdpi/splash.png', width: 1920, height: 1280 },
];

/**
 * Для foreground adaptive icon и splash нужен только знак бренда,
 * без квадратной фоновой подложки.
 */
function stripBackgroundFromMasterSvg(masterSvg) {
  return [
    /<rect width="1024" height="1024" fill="url\(#bg-fill\)" \/>\s*/g,
    /<rect width="1024" height="1024" fill="url\(#bg-top-glow\)" \/>\s*/g,
    /<rect width="1024" height="1024" fill="url\(#bg-bottom-glow\)" \/>\s*/g,
    /<rect width="1024" height="1024" fill="url\(#bg-center-haze\)" \/>\s*/g,
  ].reduce((svg, pattern) => svg.replace(pattern, ''), masterSvg);
}

function createLauncherBackdropSvg(size) {
  return `
    <svg
      width="${size}"
      height="${size}"
      viewBox="0 0 ${size} ${size}"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-fill" x1="${size * 0.12}" y1="${size * 0.09}" x2="${size * 0.88}" y2="${size * 0.92}" gradientUnits="userSpaceOnUse">
          <stop stop-color="#F8FBFF" />
          <stop offset="0.46" stop-color="#F1F5FF" />
          <stop offset="1" stop-color="#E8EEF9" />
        </linearGradient>

        <radialGradient id="bg-top-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${size * 0.26} ${size * 0.2}) rotate(33) scale(${size * 0.47} ${size * 0.31})">
          <stop stop-color="#DFF5FF" stop-opacity="0.96" />
          <stop offset="0.48" stop-color="#DFF5FF" stop-opacity="0.38" />
          <stop offset="1" stop-color="#DFF5FF" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="bg-bottom-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${size * 0.74} ${size * 0.8}) rotate(153) scale(${size * 0.36} ${size * 0.26})">
          <stop stop-color="#D9DFFF" stop-opacity="0.84" />
          <stop offset="0.52" stop-color="#D9DFFF" stop-opacity="0.26" />
          <stop offset="1" stop-color="#D9DFFF" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="bg-center-haze" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${size * 0.52} ${size * 0.48}) rotate(90) scale(${size * 0.38} ${size * 0.38})">
          <stop stop-color="#FFFFFF" stop-opacity="0.94" />
          <stop offset="0.58" stop-color="#FFFFFF" stop-opacity="0.38" />
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

function createSplashBackdropSvg(width, height) {
  return `
    <svg
      width="${width}"
      height="${height}"
      viewBox="0 0 ${width} ${height}"
      fill="none"
      xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-fill" x1="${width * 0.14}" y1="${height * 0.06}" x2="${width * 0.86}" y2="${height * 0.94}" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0E1322" />
          <stop offset="0.52" stop-color="#090D18" />
          <stop offset="1" stop-color="#070A12" />
        </linearGradient>

        <radialGradient id="bg-top-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${width * 0.28} ${height * 0.22}) rotate(33) scale(${width * 0.26} ${height * 0.22})">
          <stop stop-color="#63B8FF" stop-opacity="0.22" />
          <stop offset="0.58" stop-color="#63B8FF" stop-opacity="0.08" />
          <stop offset="1" stop-color="#63B8FF" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="bg-bottom-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${width * 0.74} ${height * 0.8}) rotate(149) scale(${width * 0.24} ${height * 0.22})">
          <stop stop-color="#8E71FF" stop-opacity="0.2" />
          <stop offset="0.58" stop-color="#8E71FF" stop-opacity="0.08" />
          <stop offset="1" stop-color="#8E71FF" stop-opacity="0" />
        </radialGradient>

        <radialGradient id="bg-center-haze" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse"
          gradientTransform="translate(${width * 0.5} ${height * 0.5}) rotate(90) scale(${Math.min(width, height) * 0.22} ${Math.min(width, height) * 0.22})">
          <stop stop-color="#FFFFFF" stop-opacity="0.08" />
          <stop offset="0.58" stop-color="#FFFFFF" stop-opacity="0.028" />
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bg-fill)" />
      <rect width="${width}" height="${height}" fill="url(#bg-top-glow)" />
      <rect width="${width}" height="${height}" fill="url(#bg-bottom-glow)" />
      <rect width="${width}" height="${height}" fill="url(#bg-center-haze)" />
    </svg>
  `;
}

async function renderSvgToBuffer(svg, size) {
  return sharp(Buffer.from(svg))
    .resize(size, size, {
      fit: 'contain',
    })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function createTransparentCanvas(size) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function renderAdaptiveForeground(markSvg, size) {
  const markSize = Math.round(size * 0.72);
  const markBuffer = await renderSvgToBuffer(markSvg, markSize);
  const canvasBuffer = await createTransparentCanvas(size);
  const inset = Math.round((size - markSize) / 2);

  return sharp(canvasBuffer)
    .composite([
      {
        input: markBuffer,
        left: inset,
        top: inset,
      },
    ])
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function renderAdaptiveBackground(size) {
  return sharp(Buffer.from(createLauncherBackdropSvg(size)))
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function renderLauncherBitmap(markSvg, size, isRound = false) {
  const backgroundBuffer = await renderAdaptiveBackground(size);
  const markSize = Math.round(size * 0.74);
  const markBuffer = await renderSvgToBuffer(markSvg, markSize);
  const inset = Math.round((size - markSize) / 2);

  const iconWithMarkBuffer = await sharp(backgroundBuffer)
    .composite([
      {
        input: markBuffer,
        left: inset,
        top: inset,
      },
    ])
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  let output = sharp(iconWithMarkBuffer);

  if (isRound) {
    const maskSvg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#FFFFFF" />
      </svg>
    `;

    output = output.composite([
      {
        input: await sharp(Buffer.from(maskSvg)).png().toBuffer(),
        blend: 'dest-in',
      },
    ]);
  }

  return output
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function renderSplash(markSvg, width, height) {
  const backdropBuffer = await sharp(
    Buffer.from(createSplashBackdropSvg(width, height))
  )
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();

  const markSize = Math.round(Math.min(width, height) * 0.34);
  const markBuffer = await renderSvgToBuffer(markSvg, markSize);
  const left = Math.round((width - markSize) / 2);
  const top = Math.round((height - markSize) / 2);

  return sharp(backdropBuffer)
    .composite([
      {
        input: markBuffer,
        left,
        top,
      },
    ])
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

async function writeRelativeFile(relativePath, buffer) {
  const absolutePath = path.join(ANDROID_RES_DIR, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
}

async function writeAdaptiveIcons(markSvg) {
  for (const target of ADAPTIVE_LAYER_TARGETS) {
    const foregroundBuffer = await renderAdaptiveForeground(
      markSvg,
      target.size
    );
    const backgroundBuffer = await renderAdaptiveBackground(target.size);

    await writeRelativeFile(
      `${target.dir}/ic_launcher_foreground.png`,
      foregroundBuffer
    );
    await writeRelativeFile(
      `${target.dir}/ic_launcher_background.png`,
      backgroundBuffer
    );
  }
}

async function writeBitmapLauncherIcons(markSvg) {
  for (const target of ICON_BITMAP_TARGETS) {
    const squareBuffer = await renderLauncherBitmap(markSvg, target.size);
    const roundBuffer = await renderLauncherBitmap(markSvg, target.size, true);

    await writeRelativeFile(`${target.dir}/ic_launcher.png`, squareBuffer);
    await writeRelativeFile(`${target.dir}/ic_launcher_round.png`, roundBuffer);
  }
}

async function writeSplashAssets(markSvg) {
  for (const target of SPLASH_TARGETS) {
    const splashBuffer = await renderSplash(
      markSvg,
      target.width,
      target.height
    );
    await writeRelativeFile(target.path, splashBuffer);
  }
}

async function main() {
  const masterSvg = await readFile(ANDROID_ICON_MASTER_PATH, 'utf8');
  const markSvg = stripBackgroundFromMasterSvg(masterSvg);

  await writeAdaptiveIcons(markSvg);
  await writeBitmapLauncherIcons(markSvg);
  await writeSplashAssets(markSvg);

  console.log('✓ Android launcher icons and splash assets generated');
}

await main();
