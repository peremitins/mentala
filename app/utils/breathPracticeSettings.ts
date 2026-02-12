/**
 * Утилита для работы с локальными настройками дыхательных практик
 * Настройки хранятся локально и не синхронизируются между устройствами
 */
import {
  getPersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

const SETTINGS_KEY = 'breath_practices_settings';

export type BreathCueMode = 'cue';

export interface BreathPracticeSettings {
  sessionMinutes: number;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  volume: number;
  hapticsEnabled: boolean;
  cueMode: BreathCueMode;
}

const DEFAULT_SETTINGS: BreathPracticeSettings = {
  sessionMinutes: 5,
  soundEnabled: true,
  voiceEnabled: false,
  volume: 100,
  hapticsEnabled: true,
  cueMode: 'cue',
};

/**
 * Загрузить настройки из локального хранилища
 */
export async function loadBreathPracticeSettings(): Promise<BreathPracticeSettings> {
  const settingsRaw = await getPersistentItem(SETTINGS_KEY);
  if (!settingsRaw) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const parsed = JSON.parse(settingsRaw) as Partial<BreathPracticeSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.error('[BreathPracticeSettings] Failed to parse settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Сохранить настройки в локальное хранилище
 */
export async function saveBreathPracticeSettings(
  partial: Partial<BreathPracticeSettings>
): Promise<void> {
  const current = await loadBreathPracticeSettings();
  const updated = {
    ...current,
    ...partial,
  };
  await setPersistentItem(SETTINGS_KEY, JSON.stringify(updated));
}
