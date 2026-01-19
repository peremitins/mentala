<template>
  <button
    type="button"
    class="group relative flex w-[78vw] min-w-[240px] max-w-[240px] flex-col overflow-hidden rounded-3xl text-left transition-all duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-primary/60 sm:w-72"
    @click="emit('open', practice.slug)"
  >
    <div class="absolute inset-0 bg-gradient-to-br" :class="accentClass" />
    <div
      class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/35 to-black/5"
    />

    <div class="relative z-10 flex h-full flex-col gap-2 p-4">
      <div class="flex items-start justify-between gap-2 ">
        <div class="space-y-1">
          <!-- <p
            class="text-[10px] uppercase tracking-[0.08em] text-white/70 drop-shadow"
          >
            {{ practice.goal }}
          </p> -->
          <h4 class="text-md font-semibold text-white leading-snug drop-shadow ">
            {{ practice.title }}
          </h4>
          <p class="line-clamp-2 text-xs text-white/85 drop-shadow">
            {{ practice.description }}
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <span class="text-xl">{{ practice.emoji }}</span>

        </div>
      </div>

      <div class="mt-auto flex flex-wrap gap-2 text-[9px]">
        {{ practice.pattern }}
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { BreathPractice } from '@/app/lib/breathPracticesCatalog';
import { Badge } from '@/app/components/ui/shadcn/badge';

// Карточка использует данные практики и заранее заданный градиент.
defineProps<{
  practice: BreathPractice;
  accentClass: string;
  isCustom?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open', slug: string): void;
}>();
</script>
