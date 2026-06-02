<template>
  <section class="glass-deep space-y-2 p-3">
    <div class="space-y-1">
      <p class="text-xs font-semibold tracking-wide text-violet-200">
        Шаг {{ step }} из {{ totalSteps }} · {{ programTitle }}
      </p>
      <h1 class="text-xs font-semibold leading-tight text-foreground">
        {{ title }}
      </h1>
    </div>

    <div class="flex items-center gap-2">
      <ProgramStepActionIndicator
        class="flex-1"
        :actions="actions"
        :current-index="currentIndex"
        :transiently-completed-ids="transientlyCompletedIds"
      />
      <span class="shrink-0 text-xs text-foreground/55">
        {{ actionNumber }} / {{ actions.length }}
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import ProgramStepActionIndicator from '@/app/components/programs/ProgramStepActionIndicator.vue';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

defineProps<{
  step: number;
  totalSteps: number;
  programTitle: string;
  title: string;
  actions: ProgramStepActionStateDto[];
  currentIndex: number;
  actionNumber: number;
  transientlyCompletedIds?: Set<string>;
}>();
</script>
