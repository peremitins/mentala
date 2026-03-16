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

    <HorizontalScroller
      :aria-label="`Лента дыхательных практик раздела ${title}`"
    >
      <template #default>
        <BreathPracticeCard
          v-for="item in items"
          :key="item.practice.slug"
          :practice="item.practice"
          :accent-class="item.accentClass"
          :is-custom="item.isCustom"
          :locked="item.locked"
          :required-plan="item.requiredPlan"
          @open="emit('open', $event)"
        />
      </template>
    </HorizontalScroller>
  </section>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import type { BreathPractice } from '@/app/lib/breathPracticesCatalog';
import BreathPracticeCard from '@/app/components/breath-practices/BreathPracticeCard.vue';
import HorizontalScroller from '@/app/components/ui/HorizontalScroller.vue';

// Описываем карточки с заранее рассчитанным цветом/типом.
export interface BreathPracticeCardItem {
  practice: BreathPractice;
  accentClass: string;
  isCustom?: boolean;
  locked?: boolean;
  requiredPlan?: 'pro' | 'premium';
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
