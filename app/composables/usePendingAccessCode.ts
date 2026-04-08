import { computed } from 'vue';

const PENDING_ACCESS_CODE_COOKIE = 'mentai.pending_access_code';

export function normalizePendingAccessCode(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function usePendingAccessCode() {
  const pendingAccessCodeCookie = useCookie<string | null>(
    PENDING_ACCESS_CODE_COOKIE,
    {
      path: '/',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    }
  );

  const pendingAccessCode = computed({
    get: () => pendingAccessCodeCookie.value || '',
    set: (value: string) => {
      const normalized = normalizePendingAccessCode(value);
      pendingAccessCodeCookie.value = normalized || null;
    },
  });

  function setPendingAccessCode(value: string | null | undefined) {
    pendingAccessCode.value = normalizePendingAccessCode(value);
  }

  function clearPendingAccessCode() {
    pendingAccessCodeCookie.value = null;
  }

  return {
    pendingAccessCode,
    setPendingAccessCode,
    clearPendingAccessCode,
  };
}
