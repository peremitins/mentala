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

const FONT_FAMILY_KEY = 'ui.font';
export const FONT_OPTIONS = [
  {
    id: 'Nunito',
    label: 'Nunito',
    description: 'Мягкий и тёплый',
  },
  {
    id: 'Bricolage Grotesque',
    label: 'Bricolage',
    description: 'Характерный',
  },
  {
    id: 'Comfortaa',
    label: 'Comfortaa',
    description: 'Округлый, мягкий',
  },
] as const;
export type FontId = (typeof FONT_OPTIONS)[number]['id'];
const DEFAULT_FONT: FontId = 'Nunito';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

interface UiSettingsState {
  auroraOpacity: number;
  fontFamily: FontId;
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

function isValidFont(value: string): value is FontId {
  return FONT_OPTIONS.some((f) => f.id === value);
}

export const useUiSettingsStore = defineStore('uiSettings', {
  state: (): UiSettingsState => ({
    auroraOpacity: DEFAULT_AURORA_OPACITY,
    fontFamily: DEFAULT_FONT,
    loaded: false,
    saving: false,
    storageKey: AURORA_OPACITY_KEY,
  }),
  actions: {
    applySettings(
      payload: Partial<Pick<UiSettingsState, 'auroraOpacity' | 'fontFamily'>>
    ) {
      if (payload.auroraOpacity !== undefined) {
        this.auroraOpacity = clampOpacity(payload.auroraOpacity);
      }
      if (payload.fontFamily !== undefined) {
        this.fontFamily = payload.fontFamily;
      }
    },
    async loadFromStorage(userId?: string | number | null) {
      const key = resolveStorageKey(userId);
      this.storageKey = key;

      let raw: string | null = null;
      if (userId !== null && userId !== undefined) {
        raw = await getPersistentItem(key);
        await removePersistentItem(AURORA_OPACITY_KEY);
      }

      const parsed = parseOpacity(raw);
      this.applySettings({
        auroraOpacity: parsed ?? DEFAULT_AURORA_OPACITY,
      });

      const savedFont = await getPersistentItem(FONT_FAMILY_KEY);
      this.applySettings({
        fontFamily:
          savedFont && isValidFont(savedFont) ? savedFont : DEFAULT_FONT,
      });

      this.loaded = true;
    },
    async ensureLoaded(userId?: string | number | null) {
      const expectedKey = resolveStorageKey(userId);
      if (this.loaded && this.storageKey === expectedKey) return;
      await this.loadFromStorage(userId);
    },
    updateAuroraOpacity(value: number) {
      this.applySettings({ auroraOpacity: value });
      this.schedulePersist();
    },
    async updateFontFamily(font: FontId) {
      this.applySettings({ fontFamily: font });
      try {
        await setPersistentItem(FONT_FAMILY_KEY, font);
      } catch (error) {
        console.error('[UiSettings] Не удалось сохранить шрифт:', error);
      }
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
