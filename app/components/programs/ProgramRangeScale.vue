<template>
  <div class="space-y-1.5">
    <div class="relative overflow-hidden px-1 pb-1 pt-8">
      <output
        class="pointer-events-none absolute top-0 flex h-7 min-w-7 -translate-x-1/2 items-center justify-center rounded-full border border-emerald-200/35 bg-emerald-200/18 px-2 text-sm font-semibold text-foreground shadow-[0_8px_20px_rgba(0,0,0,0.18)] backdrop-blur-md transition-[left]"
        :style="thumbStyle"
      >
        {{ displayValue }}
      </output>

      <input
        :id="inputId || undefined"
        type="range"
        class="program-range-scale w-full"
        :min="min"
        :max="max"
        :step="step"
        :value="displayValue"
        :style="rangeStyle"
        :aria-label="ariaLabel"
        :aria-valuetext="valueText"
        @input="updateValue"
      />
    </div>

    <div
      class="flex items-start justify-between gap-3 px-1 text-[11px] leading-snug text-foreground/58"
    >
      <span class="max-w-[45%]">{{ leftLabel }}</span>
      <span class="max-w-[45%] text-right">{{ rightLabel }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useHaptics } from '@/app/composables/useHaptics';

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    min?: number;
    max?: number;
    step?: number;
    ariaLabel: string;
    inputId?: string | null;
    minLabel?: string | null;
    maxLabel?: string | null;
    ariaValueText?: string | null;
  }>(),
  {
    min: 0,
    max: 10,
    step: 1,
    inputId: null,
    minLabel: null,
    maxLabel: null,
    ariaValueText: null,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const { triggerLight } = useHaptics();
const lastHapticValue = ref<number | null>(null);

const midpoint = computed(() => Math.round((props.min + props.max) / 2));
const displayValue = computed(() => props.modelValue ?? midpoint.value);
const progressPercent = computed(() => {
  const range = Math.max(1, props.max - props.min);
  return ((displayValue.value - props.min) / range) * 100;
});

// Точное позиционирование badge над центром thumb'а: native input range
// перемещает центр thumb'а от `thumbRadius` до `inputWidth - thumbRadius`,
// а не строго от 0 до 100% ширины контейнера. Если использовать
// `left: progress%`, бейдж дрейфует от центра thumb'а к краям трека.
// Формула: 11px + (100% - 22px) * progress, где 11px = радиус thumb.
const thumbStyle = computed(() => ({
  left: `calc(17px + (100% - 32px) * ${progressPercent.value / 100})`,
}));

const rangeStyle = computed(() => ({
  '--program-range-progress': `${progressPercent.value}%`,
}));

const leftLabel = computed(() => props.minLabel || `${props.min} · нет`);
const rightLabel = computed(() => props.maxLabel || `${props.max} · максимум`);
const valueText = computed(
  () => props.ariaValueText || `${displayValue.value} из ${props.max}`
);

function updateValue(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const newValue = Number(target.value);
  if (newValue !== lastHapticValue.value) {
    lastHapticValue.value = newValue;
    void triggerLight();
  }
  emit('update:modelValue', newValue);
}
</script>

<style scoped>
.program-range-scale {
  min-height: 44px;
  cursor: pointer;
  appearance: none;
  background: transparent;
  accent-color: rgb(110 231 183);
  /* На мобильных при горизонтальном drag нативный input range может «потянуть»
     родительский скролл и вызвать смещение всей секции вбок. pan-y оставляет
     вертикальный скролл странице, но горизонтальные жесты отдаёт инпуту. */
  touch-action: pan-y;
}

.program-range-scale:focus {
  outline: none;
}

.program-range-scale:focus-visible::-webkit-slider-thumb {
  box-shadow:
    0 0 0 5px rgb(110 231 183 / 0.22),
    0 6px 16px rgb(0 0 0 / 0.25);
}

.program-range-scale:focus-visible::-moz-range-thumb {
  box-shadow:
    0 0 0 5px rgb(110 231 183 / 0.22),
    0 6px 16px rgb(0 0 0 / 0.25);
}

.program-range-scale::-webkit-slider-runnable-track {
  height: 7px;
  border-radius: 999px;
  background: linear-gradient(
      to right,
      rgb(110 231 183 / 0.92) 0 var(--program-range-progress),
      rgb(255 255 255 / 0.2) var(--program-range-progress) 100%
    ),
    rgb(255 255 255 / 0.14);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.14);
}

.program-range-scale::-webkit-slider-thumb {
  width: 22px;
  height: 22px;
  margin-top: -7.5px;
  appearance: none;
  border: 2px solid rgb(236 253 245 / 0.96);
  border-radius: 999px;
  background: rgb(110 231 183);
  box-shadow: 0 6px 16px rgb(0 0 0 / 0.25);
}

.program-range-scale::-moz-range-track {
  height: 7px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.2);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.14);
}

.program-range-scale::-moz-range-progress {
  height: 7px;
  border-radius: 999px;
  background: rgb(110 231 183 / 0.92);
}

.program-range-scale::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border: 2px solid rgb(236 253 245 / 0.96);
  border-radius: 999px;
  background: rgb(110 231 183);
  box-shadow: 0 6px 16px rgb(0 0 0 / 0.25);
}
</style>
