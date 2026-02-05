import { defineStore } from 'pinia';
import { useAuthStore } from '@/app/stores/auth';
import { DEFAULT_SCENE_ID, findSceneTrack } from '@/app/lib/sceneSelectionCatalog';

const SAVE_DEBOUNCE_MS = 600;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let saveVersion = 0;
let changeVersion = 0;
let saveAbortController: AbortController | null = null;

interface SceneSettingsState {
  sceneId: string | null;
  volume: number;
  backgroundPlayMinutes: number;
  animateBackground: boolean;
  loaded: boolean;
  saving: boolean;
}

type SceneSettingsPayload = Partial<Pick<
  SceneSettingsState,
  'sceneId' | 'volume' | 'backgroundPlayMinutes' | 'animateBackground'
>>;

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

function normalizeSceneId(value?: string | null) {
  if (!value) return DEFAULT_SCENE_ID;
  return findSceneTrack(value)?.id ?? DEFAULT_SCENE_ID;
}

export const useSceneSettingsStore = defineStore('sceneSettings', {
  state: (): SceneSettingsState => ({
    sceneId: DEFAULT_SCENE_ID,
    // По умолчанию держим фон на 50%.
    volume: 50,
    backgroundPlayMinutes: 0,
    // По умолчанию анимация обоев выключена.
    animateBackground: false,
    loaded: false,
    saving: false,
  }),
  actions: {
    applySettings(payload: SceneSettingsPayload) {
      if (payload.sceneId !== undefined) {
        this.sceneId = normalizeSceneId(payload.sceneId);
      }
      if (payload.volume !== undefined) {
        this.volume = clampNumber(payload.volume, 0, 100);
      }
      if (payload.backgroundPlayMinutes !== undefined) {
        this.backgroundPlayMinutes = clampNumber(
          payload.backgroundPlayMinutes,
          0,
          60
        );
      }
      if (payload.animateBackground !== undefined) {
        this.animateBackground = Boolean(payload.animateBackground);
      }
    },
    async loadFromUser() {
      const auth = useAuthStore();
      const settings = (auth.user as any)?.sceneSettings ?? null;
      if (settings) {
        this.applySettings(settings);
      } else {
        this.applySettings({
          sceneId: DEFAULT_SCENE_ID,
          // По умолчанию держим фон на 50%.
          volume: 50,
          backgroundPlayMinutes: 0,
          // По умолчанию анимация обоев выключена.
          animateBackground: false,
        });
      }
      this.loaded = true;
    },
    async ensureLoaded() {
      if (this.loaded) return;
      await this.loadFromUser();
    },
    updateSettings(payload: SceneSettingsPayload) {
      this.applySettings(payload);
      // Фиксируем локальное изменение сразу, чтобы отсечь устаревшие ответы.
      changeVersion += 1;
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
      const auth = useAuthStore();
      if (!auth.user) return;
      this.saving = true;
      const changeSnapshot = changeVersion;
      const currentVersion = (saveVersion += 1);
      if (saveAbortController) {
        saveAbortController.abort();
      }
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      saveAbortController = controller;
      try {
        const payload = {
          sceneSettings: {
            sceneId: this.sceneId,
            volume: this.volume,
            backgroundPlayMinutes: this.backgroundPlayMinutes,
            animateBackground: this.animateBackground,
          },
        };
        const response: any = await useAPI('/api/user/me', {
          method: 'PATCH',
          body: payload,
          signal: controller?.signal,
        });
        if (changeSnapshot !== changeVersion) {
          // Если настройки уже поменялись, ответ больше не актуален.
          return;
        }
        if (currentVersion !== saveVersion) {
          // При быстрых переключениях игнорируем устаревший ответ.
          return;
        }
        if (response?.user) {
          auth.user = response.user;
        } else {
          // Локально синхронизируем настройку, если ответ без пользователя.
          (auth.user as any).sceneSettings = payload.sceneSettings;
        }
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') {
          return;
        }
        console.error('[SceneSettings] Не удалось сохранить настройки:', error);
      } finally {
        if (saveAbortController === controller) {
          saveAbortController = null;
          this.saving = false;
        }
      }
    },
  },
});
