function readBooleanFlag(keys: string[], defaultValue: boolean): boolean {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw === undefined) {
      continue;
    }

    const normalized = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return defaultValue;
}

/**
 * Глобальный kill-switch для чатовой TTS.
 * По умолчанию выключен.
 */
export const FEATURE_TTS_ENABLED = readBooleanFlag(
  ['FEATURE_TTS_ENABLED', 'NUXT_FEATURE_TTS_ENABLED'],
  false
);
