import { defineStore } from 'pinia';
import {
  getPersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

const SAVE_DEBOUNCE_MS = 400;
const AURORA_OPACITY_KEY = 'ui.aurora.opacity';
const MIN_AURORA_OPACITY = 0;
const MAX_AURORA_OPACITY = 1;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

interface UiSettingsState {
  auroraOpacity: number;
  loaded: boolean;
  saving: boolean;
}

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) return MAX_AURORA_OPACITY;
  return Math.min(MAX_AURORA_OPACITY, Math.max(MIN_AURORA_OPACITY, value));
}

export const useUiSettingsStore = defineStore('uiSettings', {
  state: (): UiSettingsState => ({
    // По умолчанию яркость фона 85%.
    auroraOpacity: 0.85,
    loaded: false,
    saving: false,
  }),
  actions: {
    applySettings(payload: Partial<Pick<UiSettingsState, 'auroraOpacity'>>) {
      if (payload.auroraOpacity !== undefined) {
        this.auroraOpacity = clampOpacity(payload.auroraOpacity);
      }
    },
    async loadFromStorage() {
      const raw = await getPersistentItem(AURORA_OPACITY_KEY);
      // Если ничего не сохранено — используем 85%.
      const parsed = raw !== null ? Number(raw) : 0.85;
      this.applySettings({ auroraOpacity: parsed });
      this.loaded = true;
    },
    async ensureLoaded() {
      if (this.loaded) return;
      await this.loadFromStorage();
    },
    updateAuroraOpacity(value: number) {
      // Обновляем локально сразу, чтобы UI отвечал мгновенно.
      this.applySettings({ auroraOpacity: value });
      this.schedulePersist();
    },
    schedulePersist() {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(() => {
        void this.persist();
      }, SAVE_DEBOUNCE_MS);
    },
    async persist() {
      this.saving = true;
      try {
        await setPersistentItem(AURORA_OPACITY_KEY, String(this.auroraOpacity));
      } catch (error) {
        console.error('[UiSettings] Не удалось сохранить настройки:', error);
      } finally {
        this.saving = false;
      }
    },
  },
});
