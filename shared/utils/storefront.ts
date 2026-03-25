// Нормализует storefront-код к ISO alpha-2 формату (например, RU, DE, US).
// StoreKit в некоторых сценариях может возвращать alpha-3 код (например, RUS),
// поэтому здесь приводим известные варианты к единому виду для backend-логики.
export function normalizeStorefrontCountryCode(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!text) return null;

  if (/^[A-Z]{2}$/.test(text)) {
    return text;
  }

  // StoreKit storefront может приходить как alpha-3.
  if (text === 'RUS') {
    return 'RU';
  }

  return null;
}
