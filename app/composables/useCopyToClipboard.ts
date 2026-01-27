import { useToast } from './useToast';

/**
 * Универсальная функция для копирования текста в буфер обмена
 * Работает на всех платформах (Web, iOS, Android)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof document === 'undefined') {
    console.error('[copyToClipboard] Document not available');
    return false;
  }

  // Пробуем современный Clipboard API
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn(
        '[copyToClipboard] Clipboard API failed, using fallback:',
        error
      );
      // Продолжаем к fallback
    }
  }

  // Fallback через document.execCommand (работает на мобильных)
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    return successful;
  } catch (error) {
    console.error('[copyToClipboard] execCommand failed:', error);
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * Composable для копирования с автоматическим показом уведомления
 */
export function useCopyToClipboard() {
  const copy = async (text: string, showToast = true): Promise<boolean> => {
    const success = await copyToClipboard(text);
    if (showToast) {
      if (success) {
        useToast('Скопировано', 'Текст в буфере обмена');
      } else {
        useToast('Ошибка', 'Не удалось скопировать текст');
      }
    }
    return success;
  };

  return { copy };
}
