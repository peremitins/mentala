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
    APP_LOCK_SUPPRESSED_EXACT_ROUTES.has(path) || path.startsWith('/auth/')
  );
}
