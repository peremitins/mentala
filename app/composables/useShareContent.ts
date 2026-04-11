import { Capacitor } from '@capacitor/core';
import { copyToClipboard } from '@/app/composables/useCopyToClipboard';

export type ShareContentOptions = {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
  fallbackText?: string;
};

export type ShareContentResult = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Собирает payload для Web Share API без platform-specific полей.
 */
function buildBrowserShareData(options: ShareContentOptions): ShareData {
  const shareData: ShareData = {};

  if (options.title) {
    shareData.title = options.title;
  }

  if (options.text) {
    shareData.text = options.text;
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

    await Share.share({
      title: options.title,
      text: options.text,
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
