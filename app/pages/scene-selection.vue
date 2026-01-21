<template>
  <div class="space-y-2 h-full overflow-y-auto pb-[100px] rounded-lg">
    <PageHeader
      title="🌌 Атмосфера"
      :show-back-button="true"
      @go-back="goBack"
    />

    <div class="space-y-2">
      <section class="glass-deep p-4 space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm text-foreground">Яркость фона</p>
            <p class="text-xs text-foreground/80">
              Отрегулируйте яркость атмосферы и обоев.
            </p>
          </div>
          <span class="text-xs text-foreground/80">
            {{ brightnessPercent }}%
          </span>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-foreground transition hover:text-foreground"
            aria-label="Минимальная яркость"
            @click="setBrightnessMin"
          >
            <IconSunDim class="h-4 w-4" />
          </button>
          <input
            v-model.number="backgroundBrightness"
            type="range"
            min="0"
            max="1"
            step="0.01"
            class="w-full accent-cyan-300"
          />
          <button
            type="button"
            class="text-foreground transition hover:text-foreground"
            aria-label="Максимальная яркость"
            @click="setBrightnessMax"
          >
            <IconSun class="h-4 w-4" />
          </button>
        </div>
      </section>

      <section class="glass-deep p-4 space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm text-foreground">Громкость сцены</p>
            <p class="text-xs text-foreground/80">
              Управляй уровнем фонового звучания.
            </p>
          </div>
          <span class="text-xs text-foreground/80">{{ volume }}%</span>
        </div>
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="text-foreground transition hover:text-foreground"
            aria-label="Отключить звук"
            @click="setVolumeMin"
          >
            <IconVolumeX class="h-4 w-4" />
          </button>
          <input
            v-model.number="volume"
            type="range"
            min="0"
            max="100"
            step="1"
            class="w-full accent-cyan-300"
          />
          <button
            type="button"
            class="text-foreground transition hover:text-foreground"
            aria-label="Максимальная громкость"
            @click="setVolumeMax"
          >
            <IconVolume2 class="h-4 w-4" />
          </button>
        </div>
      </section>

      <section class="glass-deep p-4 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-foreground">Анимация обоев</p>
            <p class="text-xs text-foreground/80">
              Плавное движение фона для эффекта присутствия.
            </p>
          </div>
          <Switch v-model:checked="animateBackground" />
        </div>
      </section>

      <section class="glass-deep p-4 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-1">
            <p class="text-sm font-semibold text-foreground">
              Воспроизведение звука вне приложения
            </p>
            <p class="text-xs text-foreground/80">
              После сворачивания звук отключится через выбранное время
            </p>
          </div>
        </div>
        <TimePicker
          v-model="backgroundPlayMinutes"
          mode="minutes"
          :label="''"
          :minute-min="0"
          :minute-max="60"
        >
          <template #trigger="{ formattedTime }">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-foreground transition hover:bg-white/10"
            >
              <span>{{ backgroundPlayLabel(formattedTime) }}</span>
              <IconClock class="h-4 w-4 opacity-70" />
            </button>
          </template>
        </TimePicker>
      </section>

      <section class="space-y-3 mt-6">
        <div class="px-1">
          <p class="text-xs uppercase tracking-[0.08em] text-foreground/60">
            Сцены
          </p>
          <h3 class="text-lg font-semibold text-foreground">
            Выбери атмосферу
          </h3>
        </div>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <button
            v-for="scene in SCENE_TRACKS"
            :key="scene.id"
            type="button"
            class="group text-left"
            @click="selectScene(scene.id)"
          >
            <div
              class="relative overflow-hidden rounded-2xl border transition-all"
              :class="
                isSelected(scene.id)
                  ? 'border-primary-ui/70 ring-2 ring-primary-ui/30'
                  : 'border-white/10 hover:border-white/20'
              "
            >
              <div
                v-if="isPlaceholderScene(scene.id)"
                class="h-28 w-full bg-gradient-to-br from-indigo-900/80 via-slate-900/70 to-emerald-900/60"
              >
                <div class="absolute inset-0 bg-black/35" />
                <div
                  class="relative z-10 flex h-full w-full items-center justify-center"
                >
                  <div
                    class="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80"
                  >
                    <IconSparkles class="h-3.5 w-3.5" />
                    Стандарт
                  </div>
                </div>
              </div>
              <template v-else>
                <img
                  :src="resolveMediaUrl(scene.backgroundPath)"
                  :alt="scene.title"
                  class="h-28 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                  decoding="async"
                />
                <div
                  class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
                />
              </template>
              <div class="absolute bottom-2 left-2 right-2">
                <p class="text-xs font-semibold text-white">
                  {{ scene.title }}
                </p>
              </div>
              <div
                v-if="isSelected(scene.id)"
                class="absolute top-2 right-2 rounded-full bg-primary/80 p-1 text-primary-foreground shadow-lg"
              >
                <IconCheck class="h-3.5 w-3.5" />
              </div>
            </div>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { navigateTo } from '#app';
import PageHeader from '@/app/components/PageHeader.vue';
import TimePicker from '@/app/components/TimePicker.vue';
import { Switch } from '@/app/components/ui/shadcn/switch';
import { useSceneSettingsStore } from '@/app/stores/sceneSettings';
import { useUiSettingsStore } from '@/app/stores/uiSettings';
import {
  DEFAULT_SCENE_ID,
  SCENE_TRACKS,
} from '@/app/lib/sceneSelectionCatalog';
import { resolveMediaUrl } from '@/app/utils/media';
import IconVolume2 from '~icons/lucide/volume-2';
import IconVolumeX from '~icons/lucide/volume-x';
import IconCheck from '~icons/lucide/check';
import IconClock from '~icons/lucide/clock';
import IconSparkles from '~icons/lucide/sparkles';
import IconSun from '~icons/lucide/sun';
import IconSunDim from '~icons/lucide/sun-dim';

const sceneSettings = useSceneSettingsStore();
const uiSettings = useUiSettingsStore();

const router = useRouter();

const volume = computed({
  get: () => sceneSettings.volume,
  set: (value: number) => {
    sceneSettings.updateSettings({ volume: value });
  },
});

const backgroundBrightness = computed({
  get: () => uiSettings.auroraOpacity,
  set: (value: number) => {
    uiSettings.updateAuroraOpacity(value);
  },
});

const brightnessPercent = computed(() =>
  Math.round(backgroundBrightness.value * 100)
);

const backgroundPlayMinutes = computed({
  get: () => sceneSettings.backgroundPlayMinutes,
  set: (value: number) => {
    sceneSettings.updateSettings({ backgroundPlayMinutes: value });
  },
});

const animateBackground = computed({
  get: () => sceneSettings.animateBackground,
  set: (value: boolean) => {
    sceneSettings.updateSettings({ animateBackground: value });
  },
});

const currentSceneId = computed(
  () => sceneSettings.sceneId ?? DEFAULT_SCENE_ID
);

function isSelected(id: string) {
  return currentSceneId.value === id;
}

function isPlaceholderScene(id: string) {
  // Отдельный тип карточки только для "Стандартного фона".
  return id === 'default';
}

function selectScene(id: string) {
  sceneSettings.updateSettings({ sceneId: id });
}

function backgroundPlayLabel(formattedTime: string) {
  // Явно показываем, что 0 минут выключает звук при сворачивании.
  if (backgroundPlayMinutes.value === 0) {
    return '0 мин — звук выключится сразу';
  }
  return formattedTime;
}

function setBrightnessMin() {
  // Минимальная яркость фона.
  backgroundBrightness.value = 0;
}

function setBrightnessMax() {
  // Максимальная яркость фона.
  backgroundBrightness.value = 1;
}

function setVolumeMin() {
  volume.value = 0;
}

function setVolumeMax() {
  volume.value = 100;
}

function goBack() {
  router.back();
}

onMounted(async () => {
  await Promise.all([sceneSettings.ensureLoaded(), uiSettings.ensureLoaded()]);
});
</script>
