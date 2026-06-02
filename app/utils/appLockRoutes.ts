const APP_LOCK_SUPPRESSED_EXACT_ROUTES = new Set([
  '/auth',
  '/error',
  '/forgot',
  '/reset-password',
  '/payment-success',
]);

export function isAppLockSuppressedRoute(path: string | null | undefined) {
  if (!path) return false;
  return (
    APP_LOCK_SUPPRESSED_EXACT_ROUTES.has(path) ||
    path.startsWith('/auth/') ||
    // Публичные share-страницы должны открываться без PIN-замка — это
    // путь для получателей шеренных ссылок (могут быть не залогинены).
    path.startsWith('/share/')
  );
}
