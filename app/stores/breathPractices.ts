import { defineStore } from 'pinia';
import { nanoid } from 'nanoid';
import type { BreathCustomPractice, BreathPhase } from '@/app/lib/breathPracticesCatalog';
import {
  getPersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

const CUSTOM_PRACTICES_KEY = 'breath_practices_custom';
const SETTINGS_KEY = 'breath_practices_settings';

export type BreathCueMode = 'cue';

export interface BreathPracticeSettings {
  sessionMinutes: number;
  soundEnabled: boolean;
  volume: number;
  hapticsEnabled: boolean;
  cueMode: BreathCueMode;
}

interface BreathPracticesState {
  customPractices: BreathCustomPractice[];
  settings: BreathPracticeSettings;
  isLoaded: boolean;
}

const DEFAULT_SETTINGS: BreathPracticeSettings = {
  sessionMinutes: 5,
  soundEnabled: true,
  volume: 100,
  hapticsEnabled: true,
  cueMode: 'cue',
};

export const useBreathPracticesStore = defineStore('breath-practices', {
  state: (): BreathPracticesState => ({
    customPractices: [],
    settings: { ...DEFAULT_SETTINGS },
    isLoaded: false,
  }),
  getters: {
    customById: (state) => (id: string) =>
      state.customPractices.find((practice) => practice.id === id) || null,
  },
  actions: {
    async load(): Promise<void> {
      if (this.isLoaded) return;

      // Загружаем кастомные практики и настройки в одном запросе к storage.
      const [customRaw, settingsRaw] = await Promise.all([
        getPersistentItem(CUSTOM_PRACTICES_KEY),
        getPersistentItem(SETTINGS_KEY),
      ]);

      if (customRaw) {
        try {
          const parsed = JSON.parse(customRaw) as BreathCustomPractice[];
          this.customPractices = Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.error('[BreathPracticesStore] Failed to parse custom list:', error);
          this.customPractices = [];
        }
      }

      if (settingsRaw) {
        try {
          const parsed = JSON.parse(settingsRaw) as BreathPracticeSettings;
          this.settings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
          };
        } catch (error) {
          console.error('[BreathPracticesStore] Failed to parse settings:', error);
          this.settings = { ...DEFAULT_SETTINGS };
        }
      }

      this.isLoaded = true;
    },

    async saveSettings(partial: Partial<BreathPracticeSettings>): Promise<void> {
      this.settings = {
        ...this.settings,
        ...partial,
      };

      await setPersistentItem(SETTINGS_KEY, JSON.stringify(this.settings));
    },

    async addCustom(name: string, phases: BreathPhase[]): Promise<BreathCustomPractice> {
      const now = new Date().toISOString();
      const practice: BreathCustomPractice = {
        id: nanoid(),
        name,
        phases,
        createdAt: now,
        updatedAt: now,
      };

      this.customPractices = [practice, ...this.customPractices];
      await setPersistentItem(
        CUSTOM_PRACTICES_KEY,
        JSON.stringify(this.customPractices)
      );

      return practice;
    },

    async removeCustom(id: string): Promise<void> {
      this.customPractices = this.customPractices.filter(
        (practice) => practice.id !== id
      );
      await setPersistentItem(
        CUSTOM_PRACTICES_KEY,
        JSON.stringify(this.customPractices)
      );
    },
  },
});
