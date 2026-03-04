<template>
  <div ref="rootRef" class="relative">
    <button
      type="button"
      class="h-9 w-full rounded-lg border border-white/20 bg-white/5 px-3 text-left text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="label"
      @click="open = !open"
      @keydown.esc.stop.prevent="open = false"
    >
      <span class="block truncate pr-7">{{ selectedLabel }}</span>
      <span
        class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/70"
        aria-hidden="true"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </button>

    <div
      v-if="open"
      class="absolute bottom-full left-0 z-50 mb-2 w-full rounded-lg border border-white/15 bg-[#0b1222] p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.55)]"
      role="listbox"
      :aria-label="label"
      @keydown.esc.stop.prevent="open = false"
    >
      <div class="max-h-56 overflow-auto">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-white transition hover:bg-white/5"
          :aria-selected="option.value === modelValue"
          @click="selectOption(option.value)"
        >
          <span>{{ option.label }}</span>
          <span
            v-if="option.value === modelValue"
            class="text-[10px] font-semibold text-white/70"
            aria-hidden="true"
          >
            ✓
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onClickOutside } from '@vueuse/core';

type SupportedLocale = 'ru' | 'en';

const props = defineProps<{
  modelValue: SupportedLocale;
  label: string;
  ruLabel: string;
  enLabel: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: SupportedLocale];
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const options = computed(() => [
  {
    value: 'ru' as const,
    label: props.ruLabel,
  },
  {
    value: 'en' as const,
    label: props.enLabel,
  },
]);

const selectedLabel = computed(
  () =>
    options.value.find((option) => option.value === props.modelValue)?.label ??
    props.ruLabel
);

function selectOption(nextLocale: SupportedLocale) {
  open.value = false;
  if (nextLocale === props.modelValue) {
    return;
  }
  emit('update:modelValue', nextLocale);
}

onClickOutside(rootRef, () => {
  open.value = false;
});
</script>
