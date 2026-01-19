<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-3 px-1">
      <div>
        <p class="text-xs uppercase tracking-[0.08em] text-white/50">
          {{ subtitle }}
        </p>
        <h3 class="text-xl font-semibold text-white">
          {{ title }} &nbsp;
          <span v-if="emoji" class="mr-2">{{ emoji }}</span>
        </h3>
      </div>
      <Button
        v-if="showViewAll"
        variant="ghost"
        size="sm"
        class="text-xs text-white/80 hover:text-white"
        @click="emit('view-all')"
      >
        Смотреть все
      </Button>
    </div>

    <div class="relative">
      <div
        class="flex gap-4 overflow-x-auto pb-1 pl-2 pr-6 no-scrollbar"
        data-lenis-prevent
        style="touch-action: pan-y pan-x"
      >
        <BreathPracticeCard
          v-for="item in items"
          :key="item.practice.slug"
          :practice="item.practice"
          :accent-class="item.accentClass"
          :is-custom="item.isCustom"
          @open="emit('open', $event)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import type { BreathPractice } from '@/app/lib/breathPracticesCatalog';
import BreathPracticeCard from '@/app/components/breath-practices/BreathPracticeCard.vue';

// Описываем карточки с заранее рассчитанным цветом/типом.
export interface BreathPracticeCardItem {
  practice: BreathPractice;
  accentClass: string;
  isCustom?: boolean;
}

defineProps<{
  title: string;
  subtitle?: string;
  emoji?: string;
  items: BreathPracticeCardItem[];
  showViewAll?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', slug: string): void;
  (e: 'view-all'): void;
}>();
</script>
