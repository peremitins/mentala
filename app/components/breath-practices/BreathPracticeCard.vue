<template>
  <div
    class="group relative flex w-[78vw] min-w-[210px] max-w-[240px] sm:w-52 flex-col overflow-hidden rounded-xl text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-ui/60"
  >
    <button
      type="button"
      class="relative flex w-full flex-col overflow-hidden rounded-xl text-left transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-ui/60"
      @click="emit('open', practice.slug)"
    >
      <div
        v-if="locked"
        class="absolute right-2 top-2 z-20 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/55 text-sm leading-none text-white"
      >
        <span aria-hidden="true">{{
          requiredPlan === 'premium' ? '💎' : '⭐'
        }}</span>
      </div>
      <div class="absolute inset-0 bg-gradient-to-br" :class="accentClass" />
      <div
        class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/35 to-black/5"
      />

      <div class="relative z-10 flex h-full flex-col gap-2 p-3 min-h-[120px]">
        <div class="flex items-start justify-between gap-2">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <h4 class="text-md font-semibold text-foreground leading-snug">
                {{ practice.title }}
              </h4>
              <div class="flex flex-col items-end gap-2">
                <span class="text-xl">{{ practice.emoji }}</span>
              </div>
            </div>

            <p class="line-clamp-3 text-sm text-foreground/80">
              {{ practice.description }}
            </p>
          </div>
        </div>

        <!-- <div class="mt-auto flex flex-wrap gap-2 text-[9px]">
          {{ practice.pattern }}
        </div> -->
      </div>
    </button>

    <!-- Иконка удаления для кастомных практик -->
    <button
      v-if="isCustom && customId"
      type="button"
      class="absolute top-2 right-2 z-20 rounded-full p-1.5 text-foreground/80 transition hover:text-destructive hover:bg-destructive/20 hover:bg-opacity-50"
      title="Удалить практику"
      @click.stop="emit('delete', customId)"
    >
      <IconTrash class="h-4 w-4" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { BreathPractice } from '@/app/lib/breathPracticesCatalog';
import IconTrash from '~icons/lucide/trash';

// Карточка использует данные практики и заранее заданный градиент.
defineProps<{
  practice: BreathPractice;
  accentClass: string;
  isCustom?: boolean;
  locked?: boolean;
  requiredPlan?: 'pro' | 'premium';
  customId?: string; // ID кастомной практики для удаления
}>();

const emit = defineEmits<{
  (e: 'open', slug: string): void;
  (e: 'delete', id: string): void;
}>();
</script>
