/**
 * Проброс целевого маршрута через авторизацию и онбординг.
 *
 * Воронка лендинга ведёт на `/auth?next=/practices/assessments/...`. Чтобы новый
 * пользователь после регистрации и онбординга попал именно на нужный экран,
 * целевой путь кладём в sessionStorage и забираем в финальной точке (после
 * verifyEmailCode для вернувшихся или после completeOnboarding для новых).
 *
 * sessionStorage переживает SPA-навигации и редирект OAuth в рамках одного
 * origin, поэтому механизм работает для всех способов входа.
 */

const STORAGE_KEY = 'mentala.postAuthRedirect';
const TTL_MS = 10 * 60 * 1000; // 10 минут — с запасом на регистрацию + онбординг.

/**
 * Безопасный внутренний путь: начинается с одного `/`, не ведёт на служебные
 * маршруты авторизации/онбординга и не является protocol-relative ссылкой.
 */
export function isSafeInternalPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (path === '/auth' || path.startsWith('/auth/')) return false;
  if (path.startsWith('/onboarding')) return false;
  return true;
}

export function savePostAuthRedirect(path: unknown): void {
  if (typeof window === 'undefined' || !isSafeInternalPath(path)) return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ path, ts: Date.now() })
    );
  } catch {
    // sessionStorage может быть недоступен в приватном режиме или WebView.
  }
}

/**
 * Возвращает сохранённый путь и сразу удаляет его (single-use). Уважает TTL и
 * повторно валидирует путь на случай постороннего значения в storage.
 */
export function consumePostAuthRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(STORAGE_KEY);

    const parsed = JSON.parse(raw) as { path?: unknown; ts?: number };
    if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) return null;
    return isSafeInternalPath(parsed.path) ? parsed.path : null;
  } catch {
    return null;
  }
}
