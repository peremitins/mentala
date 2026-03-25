// Серверная обработка изображений перед загрузкой в Object Storage.
// Нормализует ориентацию, очищает EXIF, конвертирует в WebP.
import sharp from 'sharp';

// Разрешённые MIME-типы — SVG намеренно запрещён (XSS-риск).
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// 3 МБ — проверяется первым, до любой обработки через sharp.
// Это защищает от умышленно раздутых файлов и экономит CPU/память.
export const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;

// Максимальная сторона изображения — при превышении выполняется ресайз.
export const MAX_DIMENSION_PX = 4096;

export interface ProcessedImage {
  buffer: Buffer;
  contentType: 'image/webp';
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  // Размер проверяется до sharp: тяжёлая обработка не запускается
  // для файлов, которые не прошли базовую валидацию.
  if (input.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `[ImageProcessor] Файл превышает максимальный размер: ${input.length} байт (лимит ${MAX_FILE_SIZE_BYTES})`,
    );
  }

  const image = sharp(input);
  const metadata = await image.metadata();

  // Ресайз только при реальном превышении лимита — без увеличения маленьких.
  if (
    (metadata.width && metadata.width > MAX_DIMENSION_PX) ||
    (metadata.height && metadata.height > MAX_DIMENSION_PX)
  ) {
    image.resize(MAX_DIMENSION_PX, MAX_DIMENSION_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const buffer = await image
    .rotate() // нормализация ориентации по EXIF перед очисткой
    .withMetadata({ exif: {} }) // удаление всех EXIF-метаданных (включая геолокацию)
    .webp({ quality: 85 }) // конвертация в WebP
    .toBuffer();

  return { buffer, contentType: 'image/webp' };
}

// Определяет MIME-тип файла по сигнатуре (magic bytes).
// Намеренно НЕ доверяем Content-Type от клиента и расширению файла.
//
// v1: поддерживаются только JPEG, PNG, WebP — сознательно ограниченный набор.
// При добавлении новых форматов перейти на специализированную библиотеку (file-type).
export function detectMimeType(buffer: Buffer): AllowedMimeType | null {
  // Минимум 12 байт нужен для проверки WebP-сигнатуры
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}
