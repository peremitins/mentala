import {
  getPersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

const SETTINGS_KEY = 'sos_tension_practice_settings';

export interface SosTensionPracticeSettings {
  sessionMinutes: number;
  soundEnabled: boolean;
  volume: number;
  hapticsEnabled: boolean;
}

const DEFAULT_SETTINGS: SosTensionPracticeSettings = {
  sessionMinutes: 2,
  soundEnabled: true,
  volume: 100,
  hapticsEnabled: true,
};

export async function loadSosTensionPracticeSettings(): Promise<SosTensionPracticeSettings> {
  const raw = await getPersistentItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };

  try {
    const parsed = JSON.parse(raw) as Partial<SosTensionPracticeSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.error('[SosTensionPracticeSettings] Failed to parse settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSosTensionPracticeSettings(
  partial: Partial<SosTensionPracticeSettings>
): Promise<void> {
  const current = await loadSosTensionPracticeSettings();
  const next = {
    ...current,
    ...partial,
  };
  await setPersistentItem(SETTINGS_KEY, JSON.stringify(next));
}
