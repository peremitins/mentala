<template>
  <section class="">
    <div class="flex items-center justify-between gap-3 pt-4 pb-2 px-4">
      <div>
        <p
          class="text-[10px] uppercase tracking-[0.08em] text-foreground/80 leading-snug"
        >
          {{ subtitle }}
        </p>
        <h3 class="text-lg font-semibold text-foreground leading-snug">
          {{ title }} &nbsp;
          <span v-if="emoji" class="mr-2">{{ emoji }}</span>
        </h3>
      </div>
      <Button
        v-if="showViewAll"
        variant="ghost"
        size="sm"
        class="text-xs text-foreground/80 hover:text-foreground"
        @click="emit('view-all')"
      >
        Смотреть все
      </Button>
    </div>

    <div class="relative">
      <div
        class="flex gap-4 overflow-x-auto pb-4 pl-4 pr-6 no-scrollbar"
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
  customId?: string; // ID кастомной практики для удаления
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
