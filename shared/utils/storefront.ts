// Alpha-3 → Alpha-2 маппинг для StoreKit storefront кодов.
// StoreKit 2 Storefront.countryCode возвращает ISO 3166-1 alpha-3 (RUS, USA, DEU, ...).
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  RUS: 'RU',
  USA: 'US',
  GBR: 'GB',
  DEU: 'DE',
  FRA: 'FR',
  JPN: 'JP',
  CHN: 'CN',
  KOR: 'KR',
  BRA: 'BR',
  IND: 'IN',
  CAN: 'CA',
  AUS: 'AU',
  ITA: 'IT',
  ESP: 'ES',
  NLD: 'NL',
  TUR: 'TR',
  MEX: 'MX',
  IDN: 'ID',
  POL: 'PL',
  SWE: 'SE',
  NOR: 'NO',
  DNK: 'DK',
  FIN: 'FI',
  AUT: 'AT',
  CHE: 'CH',
  BEL: 'BE',
  PRT: 'PT',
  CZE: 'CZ',
  GRC: 'GR',
  ISR: 'IL',
  SGP: 'SG',
  HKG: 'HK',
  TWN: 'TW',
  THA: 'TH',
  MYS: 'MY',
  PHL: 'PH',
  VNM: 'VN',
  ARE: 'AE',
  SAU: 'SA',
  EGY: 'EG',
  ZAF: 'ZA',
  NGA: 'NG',
  COL: 'CO',
  ARG: 'AR',
  CHL: 'CL',
  PER: 'PE',
  UKR: 'UA',
  ROU: 'RO',
  HUN: 'HU',
  KAZ: 'KZ',
};

// Нормализует storefront-код к ISO alpha-2 формату (например, RU, DE, US).
// StoreKit 2 возвращает alpha-3 (RUS, USA, DEU), Swift-плагин конвертирует в alpha-2,
// но на всякий случай обрабатываем оба формата.
export function normalizeStorefrontCountryCode(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!text) return null;

  if (/^[A-Z]{2}$/.test(text)) {
    return text;
  }

  if (/^[A-Z]{3}$/.test(text)) {
    return ALPHA3_TO_ALPHA2[text] ?? null;
  }

  return null;
}
