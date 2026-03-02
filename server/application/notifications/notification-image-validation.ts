import notificationImageSizeMap from './notification-image-size-map.json';

export const MAX_NOTIFICATION_IMAGE_BYTES = 1_000_000;

const NOTIFICATION_IMAGE_PREFIX = '/notifications/';
const ALLOWED_IMAGE_EXTENSION_RE = /\.(jpe?g|png)$/i;
const notificationImageSizeLookup = notificationImageSizeMap as Record<
  string,
  number
>;

type ValidReason =
  | 'url_parse_failed'
  | 'url_not_https'
  | 'path_outside_notifications'
  | 'unsupported_extension'
  | 'size_unknown'
  | 'size_exceeded';

export type NotificationImageValidationResult =
  | {
      valid: true;
      normalizedUrl: string;
      path: string;
      sizeBytes: number;
    }
  | {
      valid: false;
      reason: ValidReason;
      path?: string;
      sizeBytes?: number;
    };

function normalizeNotificationPath(pathname: string): string {
  let decodedPath = pathname;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    // Если URL содержит некорректный escape, оставляем исходную строку.
    decodedPath = pathname;
  }

  const withoutTrailingSlash = decodedPath.endsWith('/')
    ? decodedPath.slice(0, -1)
    : decodedPath;
  return withoutTrailingSlash;
}

export function validateNotificationImagePath(
  path: string
): NotificationImageValidationResult {
  const normalizedPath = normalizeNotificationPath(path);

  if (!normalizedPath.startsWith(NOTIFICATION_IMAGE_PREFIX)) {
    return { valid: false, reason: 'path_outside_notifications' };
  }

  if (!ALLOWED_IMAGE_EXTENSION_RE.test(normalizedPath)) {
    return {
      valid: false,
      reason: 'unsupported_extension',
      path: normalizedPath,
    };
  }

  const sizeBytes = notificationImageSizeLookup[normalizedPath];
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { valid: false, reason: 'size_unknown', path: normalizedPath };
  }

  if (sizeBytes > MAX_NOTIFICATION_IMAGE_BYTES) {
    return {
      valid: false,
      reason: 'size_exceeded',
      path: normalizedPath,
      sizeBytes,
    };
  }

  return {
    valid: true,
    normalizedUrl: normalizedPath,
    path: normalizedPath,
    sizeBytes,
  };
}

export function validateNotificationImageUrl(
  rawImageUrl: string
): NotificationImageValidationResult {
  const trimmed = rawImageUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'url_parse_failed' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'url_parse_failed' };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { valid: false, reason: 'url_not_https' };
  }

  const pathValidation = validateNotificationImagePath(parsedUrl.pathname);
  if (!pathValidation.valid) {
    return pathValidation;
  }

  return {
    valid: true,
    normalizedUrl: parsedUrl.toString(),
    path: pathValidation.path,
    sizeBytes: pathValidation.sizeBytes,
  };
}
