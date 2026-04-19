const UNSAFE_ERROR_PATTERNS = [
  /failed query:/i,
  /\bselect\b[\s\S]*\bfrom\b/i,
  /\binsert\b[\s\S]*\binto\b/i,
  /\bupdate\b[\s\S]*\bset\b/i,
  /\bdelete\b[\s\S]*\bfrom\b/i,
  /\bparams:\b/i,
  /\bpostgres(?:ql)?\b/i,
  /\bdrizzle\b/i,
  /\bsyntax error\b/i,
  /\bstack\b/i,
  /\bat\s+.+:\d+:\d+/i,
];

const DEFAULT_SAFE_ERROR_MESSAGE =
  'Произошла внутренняя ошибка. Попробуйте ещё раз позже.';

function normalizeErrorText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

export function isUnsafeErrorMessage(value: unknown): boolean {
  const message = normalizeErrorText(value);
  if (!message) return false;

  if (message.length > 220) {
    return true;
  }

  return UNSAFE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function sanitizePublicErrorMessage(
  value: unknown,
  fallback: string = DEFAULT_SAFE_ERROR_MESSAGE
): string {
  const message = normalizeErrorText(value);
  if (!message) return fallback;
  if (isUnsafeErrorMessage(message)) return fallback;
  return message;
}
