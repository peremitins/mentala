import { defineStore } from 'pinia';
import {
  getPersistentItem,
  removePersistentItem,
  setPersistentItem,
} from '@/app/utils/persistentStorage';

const SAVE_DEBOUNCE_MS = 400;
const AURORA_OPACITY_KEY = 'ui.aurora.opacity';
const AURORA_OPACITY_USER_KEY_PREFIX = 'ui.aurora.opacity.user';
const DEFAULT_AURORA_OPACITY = 0.85;
const MIN_AURORA_OPACITY = 0;
const MAX_AURORA_OPACITY = 1;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

interface UiSettingsState {
  auroraOpacity: number;
  loaded: boolean;
  saving: boolean;
  storageKey: string;
}

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) return MAX_AURORA_OPACITY;
  return Math.min(MAX_AURORA_OPACITY, Math.max(MIN_AURORA_OPACITY, value));
}

function resolveStorageKey(userId?: string | number | null): string {
  if (userId === null || userId === undefined) return AURORA_OPACITY_KEY;
  return `${AURORA_OPACITY_USER_KEY_PREFIX}.${userId}`;
}

function parseOpacity(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export const useUiSettingsStore = defineStore('uiSettings', {
  state: (): UiSettingsState => ({
    // По умолчанию яркость фона 85%.
    auroraOpacity: DEFAULT_AURORA_OPACITY,
    loaded: false,
    saving: false,
    storageKey: AURORA_OPACITY_KEY,
  }),
  actions: {
    applySettings(payload: Partial<Pick<UiSettingsState, 'auroraOpacity'>>) {
      if (payload.auroraOpacity !== undefined) {
        this.auroraOpacity = clampOpacity(payload.auroraOpacity);
      }
    },
    async loadFromStorage(userId?: string | number | null) {
      const key = resolveStorageKey(userId);
      this.storageKey = key;

      let raw: string | null = null;
      if (userId !== null && userId !== undefined) {
        raw = await getPersistentItem(key);
        // Для новых пользователей не используем старый общий ключ.
        await removePersistentItem(AURORA_OPACITY_KEY);
      }

      const parsed = parseOpacity(raw);
      this.applySettings({
        auroraOpacity: parsed ?? DEFAULT_AURORA_OPACITY,
      });
      this.loaded = true;
    },
    async ensureLoaded(userId?: string | number | null) {
      const expectedKey = resolveStorageKey(userId);
      if (this.loaded && this.storageKey === expectedKey) return;
      await this.loadFromStorage(userId);
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
        await setPersistentItem(this.storageKey, String(this.auroraOpacity));
      } catch (error) {
        console.error('[UiSettings] Не удалось сохранить настройки:', error);
      } finally {
        this.saving = false;
      }
    },
  },
});
