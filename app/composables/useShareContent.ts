import { Capacitor } from '@capacitor/core';
import { copyToClipboard } from '@/app/composables/useCopyToClipboard';

export type ShareContentOptions = {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
  fallbackText?: string;
  /**
   * Опциональный URL картинки, которую нужно приложить. На web используется
   * через `navigator.share({ files: [File] })` если браузер поддерживает.
   * На native (Capacitor) — пока не поддерживается без @capacitor/filesystem,
   * вместо этого расчёт на og:image в шеренной ссылке.
   */
  imageUrl?: string;
  imageFileName?: string;
};

export type ShareContentResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Конвертирует image-blob в PNG через canvas. PNG/JPEG возвращаем как есть.
 *
 * Зачем: исходные картинки растений — webp. Telegram (и часть приложений) не
 * принимает webp как фото через системный share-лист — он ассоциирует webp со
 * стикерами, поэтому изображение «не прикреплялось», уходил только текст. PNG
 * принимается везде как обычное фото.
 */
async function toShareableImageFile(
  blob: Blob,
  fileName: string
): Promise<File> {
  if (blob.type === 'image/png' || blob.type === 'image/jpeg') {
    return new File([blob], fileName, { type: blob.type });
  }
  try {
    if (
      typeof createImageBitmap === 'function' &&
      typeof document !== 'undefined'
    ) {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (pngBlob) {
          const pngName = fileName.replace(/\.[a-z0-9]+$/i, '') + '.png';
          return new File([pngBlob], pngName, { type: 'image/png' });
        }
      }
    }
  } catch (error) {
    console.warn('[shareContent] webp→png conversion failed:', error);
  }
  return new File([blob], fileName, { type: blob.type || 'image/webp' });
}

/**
 * Загружает картинку с указанного URL и оборачивает её в File для Web Share API.
 * Возвращает null при любой ошибке (CORS, missing, и т.п.) — шеринг продолжится
 * без файла, основываясь на title/text/url.
 */
async function fetchImageAsFile(
  url: string,
  fileName: string
): Promise<File | null> {
  try {
    const absoluteUrl = url.startsWith('http')
      ? url
      : typeof window !== 'undefined'
        ? new URL(url, window.location.origin).toString()
        : url;
    const res = await fetch(absoluteUrl, { credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await toShareableImageFile(blob, fileName);
  } catch (error) {
    console.warn('[shareContent] fetchImageAsFile failed:', error);
    return null;
  }
}

/**
 * Собирает payload для Web Share API.
 *
 * Ссылку встраиваем прямо в text, а не только в поле url. На десктопе (Chrome
 * на macOS) системный share-лист и многие таргеты игнорируют поле url и берут
 * только text — тогда ссылка терялась, уходил голый текст без превью. Со ссылкой
 * в тексте link-preview таргеты (Telegram, Slack, заметки) сами подтягивают
 * og:image со страницы /share/garden/[slug], поэтому картинка появляется даже
 * когда файл-шеринг на десктопе недоступен. Поле url оставляем для таргетов,
 * умеющих рендерить богатое превью из него.
 */
function buildBrowserShareData(options: ShareContentOptions): ShareData {
  const shareData: ShareData = {};

  if (options.title) {
    shareData.title = options.title;
  }

  const text =
    options.text && options.url
      ? `${options.text}\n${options.url}`
      : options.text;
  if (text) {
    shareData.text = text;
  }

  if (options.url) {
    shareData.url = options.url;
  }

  return shareData;
}

/**
 * Определяет, отменил ли пользователь системный share-sheet.
 */
function isShareCancelledError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message).toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes('cancel') ||
    message.includes('dismiss') ||
    message.includes('abort')
  );
}

/**
 * Проверяет, можно ли использовать Web Share API для конкретного payload.
 */
function canUseBrowserShare(shareData: ShareData): boolean {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function'
  ) {
    return false;
  }

  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare(shareData);
    } catch (error) {
      console.warn(
        '[shareContent] navigator.canShare failed, using fallback:',
        error
      );
      return false;
    }
  }

  return Object.keys(shareData).length > 0;
}

/**
 * Пытается открыть native share-sheet через официальный Capacitor Share plugin.
 */
async function tryNativeShare(
  options: ShareContentOptions
): Promise<ShareContentResult | null> {
  if (
    import.meta.server ||
    !Capacitor.isNativePlatform() ||
    !Capacitor.isPluginAvailable('Share')
  ) {
    return null;
  }

  try {
    const { Share } = await import('@capacitor/share');
    const { value } = await Share.canShare();

    if (!value) {
      return null;
    }

    // На Android многие таргеты (мессенджеры, заметки) читают только EXTRA_TEXT
    // и игнорируют поле url — тогда ссылка на сад терялась. Поэтому встраиваем
    // ссылку прямо в текст. iOS по этой же ссылке в тексте подтягивает og:image
    // превью со страницы /share/garden/[slug]. Поле url оставляем для таргетов,
    // которые умеют рендерить богатое превью.
    const nativeText =
      options.text && options.url
        ? `${options.text}\n${options.url}`
        : options.text;

    await Share.share({
      title: options.title,
      text: nativeText,
      url: options.url,
      dialogTitle: options.dialogTitle,
    });

    return 'shared';
  } catch (error) {
    if (isShareCancelledError(error)) {
      return 'cancelled';
    }

    console.error('[shareContent] Native share failed:', error);
    return null;
  }
}

/**
 * Универсальный share для Capacitor native и обычного web.
 */
export async function shareContent(
  options: ShareContentOptions
): Promise<ShareContentResult> {
  const nativeResult = await tryNativeShare(options);
  if (nativeResult) {
    return nativeResult;
  }

  const shareData = buildBrowserShareData(options);

  // Если есть imageUrl — пытаемся приложить картинку через Web Share API
  // (поддерживается в Safari iOS 15+, Chrome Android, Edge). При ошибке /
  // отсутствии поддержки тихо откатываемся к шерингу без файла.
  if (options.imageUrl && typeof window !== 'undefined') {
    const fileName = options.imageFileName || 'mentala-garden.webp';
    const file = await fetchImageAsFile(options.imageUrl, fileName);
    if (file && typeof navigator !== 'undefined') {
      // ВАЖНО: при шеринге файла НЕ передаём поле url. Web Share API во многих
      // браузерах (в т.ч. Chrome на macOS) отклоняет canShare(), если в payload
      // одновременно есть и files, и url — поделиться можно либо файлом, либо
      // ссылкой. Из-за этого картинка не прикреплялась и шеринг откатывался на
      // голый текст. Ссылка уже вшита в text (buildBrowserShareData), поэтому
      // здесь оставляем только title + text + files.
      const dataWithFiles: ShareData & { files?: File[] } = {
        files: [file],
      };
      if (shareData.title) dataWithFiles.title = shareData.title;
      if (shareData.text) dataWithFiles.text = shareData.text;
      try {
        if (
          typeof navigator.canShare === 'function' &&
          navigator.canShare(dataWithFiles)
        ) {
          await navigator.share(dataWithFiles);
          return 'shared';
        }
      } catch (error) {
        if (isShareCancelledError(error)) return 'cancelled';
        console.warn(
          '[shareContent] share with files failed, falling back:',
          error
        );
      }
    }
  }

  if (canUseBrowserShare(shareData)) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (error) {
      if (isShareCancelledError(error)) {
        return 'cancelled';
      }

      console.error('[shareContent] Browser share failed:', error);
    }
  }

  if (options.fallbackText) {
    const copied = await copyToClipboard(options.fallbackText);
    return copied ? 'copied' : 'failed';
  }

  return 'failed';
}
