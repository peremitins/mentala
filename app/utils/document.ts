/**
 * Безопасно проверяет доступность document
 */
export function isDocumentAvailable(): boolean {
  return typeof document !== 'undefined' && !!document.body;
}

/**
 * Безопасно добавляет элемент в document.body
 */
export function safeAppendToBody(element: HTMLElement): boolean {
  if (!isDocumentAvailable()) return false;
  try {
    document.body.appendChild(element);
    return true;
  } catch (error) {
    console.error('[Document] Failed to append to body:', error);
    return false;
  }
}

/**
 * Безопасно удаляет элемент из document.body
 */
export function safeRemoveFromBody(element: HTMLElement): boolean {
  if (!isDocumentAvailable()) return false;
  try {
    if (element.parentNode === document.body) {
      document.body.removeChild(element);
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Document] Failed to remove from body:', error);
    return false;
  }
}
