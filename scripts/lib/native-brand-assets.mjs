import { Buffer } from 'node:buffer';
import sharp from 'sharp';

export const PNG_OUTPUT_OPTIONS = Object.freeze({
  compressionLevel: 9,
  adaptiveFiltering: true,
});

const ADAPTIVE_FOREGROUND_MARK_SCALE = 0.72;
const LAUNCHER_BITMAP_MARK_SCALE = 0.74;

/**
 * Убирает квадратную фоновую карточку из бренд-мастера,
 * чтобы знак можно было переиспользовать в adaptive foreground и splash.
 */
export function stripBackgroundFromMasterSvg(masterSvg) {
  return [
    /<rect width="1024" height="1024" fill="url\(#bg-fill\)" \/>\s*/g,
    /<rect width="1024" height="1024" fill="url\(#bg-top-glow\)" \/>\s*/g,
    /<rect width="1024" height="1024" fill="url\(#bg-bottom-glow\)" \/>\s*/g,
    /<rect width="1024" height="1024" fill="url\(#bg-center-haze\)" \/>\s*/g,
  ].reduce((svg, pattern) => svg.replace(pattern, ''), masterSvg);
}

/**
 * Светлая брендовая подложка для launcher-иконок.
 * Она должна совпадать на iOS и Android, чтобы визуал не разъезжался между платформами.
 */
export function createLauncherBackdropSvg(size) {
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

export async function renderSvgToBuffer(svg, size, fit = 'contain') {
  return sharp(Buffer.from(svg))
    .resize(size, size, {
      fit,
    })
    .png(PNG_OUTPUT_OPTIONS)
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
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();
}

export async function renderLauncherBackdrop(size) {
  return sharp(Buffer.from(createLauncherBackdropSvg(size)))
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();
}

/**
 * Центрирует знак на прозрачном квадрате. Нужен для Android adaptive foreground.
 */
export async function renderCenteredTransparentMark(
  markSvg,
  size,
  { markScale = ADAPTIVE_FOREGROUND_MARK_SCALE } = {}
) {
  const markSize = Math.round(size * markScale);
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
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();
}

/**
 * Собирает готовую launcher-иконку из общей светлой подложки и знака бренда.
 * Для iOS используем ту же композицию, что и для квадратного Android launcher bitmap.
 */
export async function renderLauncherBitmap(
  markSvg,
  size,
  {
    isRound = false,
    markScale = LAUNCHER_BITMAP_MARK_SCALE,
    removeAlpha = false,
  } = {}
) {
  const backgroundBuffer = await renderLauncherBackdrop(size);
  const markSize = Math.round(size * markScale);
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
    .png(PNG_OUTPUT_OPTIONS)
    .toBuffer();

  let pipeline = sharp(iconWithMarkBuffer);

  if (isRound) {
    const maskSvg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#FFFFFF" />
      </svg>
    `;

    pipeline = pipeline.composite([
      {
        input: await sharp(Buffer.from(maskSvg)).png().toBuffer(),
        blend: 'dest-in',
      },
    ]);
  }

  if (removeAlpha && !isRound) {
    pipeline = pipeline.removeAlpha();
  }

  return pipeline.png(PNG_OUTPUT_OPTIONS).toBuffer();
}
