import { randomUUID } from 'node:crypto';
import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';
import { detectMimeType, processImage } from '@/server/infrastructure/storage/image-processor';
import { buildPublicUrl, uploadToStorage } from '@/server/infrastructure/storage/upload';
import { GratitudeDiaryPhotoUploadDto } from '@/shared/dto';

const PHOTO_FEATURE_KEY = 'gratitude.photo.upload';

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const userId = Number(sessionResult.user.id);

  const billing = await getBillingSnapshot(userId, sessionResult.user.roleId);
  const access = getFeatureAccessOrDefault(billing, PHOTO_FEATURE_KEY);
  if (!access.available) {
    throw createError({
      statusCode: 402,
      statusMessage: 'Feature requires higher plan',
      data: toFeaturePlanRequiredPayload({ featureKey: PHOTO_FEATURE_KEY, access }),
    });
  }

  const body = await readBody(event);
  const parsed = GratitudeDiaryPhotoUploadDto.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const { base64 } = parsed.data;
  const rawBuffer = Buffer.from(base64, 'base64');

  if (!rawBuffer.length) {
    setResponseStatus(event, 400);
    return { error: true, message: 'Пустой файл' } as const;
  }

  // Проверка размера — первой, до любой обработки через sharp.
  // Лимит 3 МБ намеренно жёсткий: processImage проверяет его же, но здесь мы
  // экономим CPU и возвращаем понятную ошибку без запуска heavy-обработки.
  const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
  if (rawBuffer.length > MAX_PHOTO_BYTES) {
    setResponseStatus(event, 413);
    return { error: true, message: 'Файл слишком большой (максимум 3 МБ)' } as const;
  }

  // Определяем MIME-тип по сигнатуре файла — Content-Type от клиента игнорируется.
  const detectedMime = detectMimeType(rawBuffer);
  if (!detectedMime) {
    setResponseStatus(event, 415);
    return {
      error: true,
      message: 'Неподдерживаемый формат файла. Допустимы: JPEG, PNG, WebP',
    } as const;
  }

  // Нормализация: EXIF очищен, ориентация исправлена, конвертировано в WebP.
  let processed;
  try {
    processed = await processImage(rawBuffer);
  } catch (err) {
    console.error('[upload-photo] Ошибка обработки изображения', { userId, err });
    setResponseStatus(event, 422);
    return { error: true, message: 'Не удалось обработать изображение' } as const;
  }

  // Ключ содержит только безопасные ASCII-символы.
  // Расширение берётся из реально определённого формата — не из имени клиента.
  const storageKey = `user-uploads/gratitude-diary/${userId}/${Date.now()}-${randomUUID()}.webp`;

  try {
    await uploadToStorage({
      key: storageKey,
      buffer: processed.buffer,
      contentType: processed.contentType,
      userId,
    });
  } catch (err) {
    const error = err as Error & { $metadata?: { httpStatusCode?: number } };
    const statusCode = error.$metadata?.httpStatusCode;

    // 503: хранилище недоступно
    if (statusCode === 503 || statusCode === 502) {
      setResponseStatus(event, 503);
      return { error: true, message: 'Хранилище временно недоступно' } as const;
    }

    setResponseStatus(event, 500);
    return { error: true, message: 'Ошибка загрузки файла' } as const;
  }

  return {
    url: buildPublicUrl(storageKey),
    storageKey,
  };
});
