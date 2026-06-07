<template>
  <!--
    Регулятор громкости ассистента для веба. Нужен ТОЛЬКО на Android в браузере и
    PWA: там аппаратные клавиши громкости физически не управляют WebRTC-аудио
    (media-канал vs call-канал — известное ограничение Android Chrome, см.
    .docs/arch_audio_platforms.md). На нативном Android громкость чинит плагин
    через AudioManager, на iOS (движок WebKit) и desktop клавиши работают штатно —
    там регулятор не показываем.
  -->
  <div v-if="shouldShow" ref="rootRef" class="relative flex items-center">
    <button
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-foreground/80 transition hover:border-white/20 hover:text-foreground"
      :class="open ? 'border-primary-ui/40 text-primary-ui' : ''"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <IconVolumeX v-if="volumePercent === 0" class="h-4 w-4" />
      <IconVolume1 v-else-if="volumePercent < 50" class="h-4 w-4" />
      <IconVolume2 v-else class="h-4 w-4" />
    </button>

    <Transition name="vol-pop">
      <div
        v-if="open"
        class="vol-pop glass-deep absolute right-0 top-[calc(100%+10px)] z-50 flex w-60 items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 shadow-xl backdrop-blur-md"
      >
        <IconVolume2 class="h-4 w-4 flex-none text-primary-ui" />
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          class="vol-slider flex-1"
          :style="sliderStyle"
          :value="volumePercent"
          :aria-label="ariaLabel"
          @input="onSliderInput"
        />
        <span
          class="w-9 flex-none text-right text-xs font-medium tabular-nums text-foreground/80"
        >
          {{ volumePercent }}%
        </span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { Capacitor } from '@capacitor/core';
import IconVolume1 from '~icons/lucide/volume-1';
import IconVolume2 from '~icons/lucide/volume-2';
import IconVolumeX from '~icons/lucide/volume-x';
import { useRealtimeVoiceUiStore } from '@/app/stores/realtimeVoiceUi';

const realtimeVoiceUi = useRealtimeVoiceUiStore();

const rootRef = ref<HTMLElement | null>(null);
const open = ref(false);

// Платформа фиксирована на время жизни страницы — вычисляем один раз.
const isAndroidWebOrPwa = (() => {
  if (typeof navigator === 'undefined') {
    return false;
  }
  // Нативный Android-апп чинит громкость на уровне AudioManager — там регулятор
  // не нужен. Остаётся именно браузер/PWA на Android.
  if (Capacitor.isNativePlatform()) {
    return false;
  }
  return /android/i.test(navigator.userAgent);
})();

// Показываем только когда realtime voice реально звучит (есть что регулировать).
const shouldShow = computed(
  () => isAndroidWebOrPwa && realtimeVoiceUi.status !== 'idle'
);

const volumePercent = computed(() => realtimeVoiceUi.outputVolumePercent);
const ariaLabel = computed(
  () => `Громкость ассистента: ${volumePercent.value}%`
);

// Заливка трека как прогресс-бар: сплошной accent до текущего значения, дальше —
// приглушённый. Цвета строго через CSS-переменную темы.
const sliderStyle = computed(() => {
  const pct = volumePercent.value;
  return {
    background: `linear-gradient(to right, hsl(var(--primary-ui)) 0%, hsl(var(--primary-ui)) ${pct}%, hsl(var(--primary-ui) / 0.2) ${pct}%, hsl(var(--primary-ui) / 0.2) 100%)`,
  };
});

function toggleOpen() {
  open.value = !open.value;
}

function onSliderInput(event: Event) {
  const target = event.target as HTMLInputElement;
  realtimeVoiceUi.setOutputVolume(Number(target.value) / 100);
}

onClickOutside(rootRef, () => {
  open.value = false;
});
</script>

<style scoped>
.vol-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 9999px;
  cursor: pointer;
  outline: none;
}

.vol-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  background: hsl(var(--primary-ui));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.vol-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 9999px;
  background: hsl(var(--primary-ui));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.vol-slider::-moz-range-track {
  background: transparent;
}

/* Анимированное появление поповера от иконки (правый верхний угол). */
.vol-pop {
  transform-origin: top right;
}

.vol-pop-enter-active,
.vol-pop-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.vol-pop-enter-from,
.vol-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
</style>
