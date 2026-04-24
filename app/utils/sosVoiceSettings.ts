import {
  getPersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

const SETTINGS_KEY = 'sos.tension.voice_enabled';

export interface SosVoiceSettings {
  voiceEnabled: boolean;
}

const DEFAULT_SETTINGS: SosVoiceSettings = {
  // По умолчанию в SOS-практике озвучка включена, если пользователь
  // ещё ни разу явно не сохранял локальную настройку.
  voiceEnabled: true,
};

/**
 * Загружает локальные настройки озвучки SOS-практики.
 */
export async function loadSosVoiceSettings(): Promise<SosVoiceSettings> {
  const value = await getPersistentItem(SETTINGS_KEY);
  if (value === null) return { ...DEFAULT_SETTINGS };
  return {
    voiceEnabled: value === 'true',
  };
}

/**
 * Сохраняет локальные настройки озвучки SOS-практики.
 */
export async function saveSosVoiceSettings(
  partial: Partial<SosVoiceSettings>
): Promise<void> {
  const current = await loadSosVoiceSettings();
  const next = {
    ...current,
    ...partial,
  };
  await setPersistentItem(SETTINGS_KEY, String(next.voiceEnabled));
}
