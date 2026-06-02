<template>
  <section class="glass-deep space-y-3 p-4 animate-slide-up">
    <h2 class="text-sm font-semibold text-foreground">Как ты сейчас?</h2>

    <div class="grid grid-cols-5 gap-2 justify-items-center">
      <button
        v-for="item in moods"
        :key="item.value"
        type="button"
        class="flex h-[50px] w-[50px] items-center justify-center rounded-full border text-[28px] transition duration-200 active:scale-95 disabled:opacity-60"
        :class="
          props.selectedMood === item.value
            ? item.activeClass
            : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
        "
        :aria-label="item.label"
        :disabled="props.pending"
        @click="handleSelect(item.value)"
      >
        <span
          class="flex items-center justify-center pt-[4px] transition-transform duration-200"
          :class="{ 'scale-110': props.selectedMood === item.value }"
        >
          {{ item.emoji }}
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { MoodCheckinMood } from '@/shared/dto/retention';
import { useHaptics } from '@/app/composables/useHaptics';

const { triggerLight } = useHaptics();

const props = defineProps<{
  selectedMood: MoodCheckinMood | null;
  pending?: boolean;
}>();

const emit = defineEmits<{
  (event: 'select', mood: MoodCheckinMood): void;
}>();

function handleSelect(mood: MoodCheckinMood) {
  void triggerLight();
  emit('select', mood);
}

const moods: Array<{
  value: MoodCheckinMood;
  emoji: string;
  label: string;
  activeClass: string;
}> = [
  {
    value: 'very_bad',
    emoji: '😣',
    label: 'Тяжело',
    activeClass:
      'border-rose-300/40 bg-rose-400/20 shadow-[0_0_0_1px_rgba(253,164,175,0.18)]',
  },
  {
    value: 'sad',
    emoji: '😟',
    label: 'Грустно',
    activeClass:
      'border-amber-300/40 bg-amber-300/20 shadow-[0_0_0_1px_rgba(252,211,77,0.16)]',
  },
  {
    value: 'neutral',
    emoji: '😐',
    label: 'Нейтрально',
    activeClass:
      'border-white/25 bg-white/20 shadow-[0_0_0_1px_rgba(255,255,255,0.14)]',
  },
  {
    value: 'good',
    emoji: '🙂',
    label: 'Хорошо',
    activeClass:
      'border-emerald-200/40 bg-emerald-300/20 shadow-[0_0_0_1px_rgba(110,231,183,0.15)]',
  },
  {
    value: 'great',
    emoji: '😊',
    label: 'Отлично',
    activeClass:
      'border-teal-200/50 bg-teal-300/20 shadow-[0_0_0_1px_rgba(94,234,212,0.18)]',
  },
];
</script>
