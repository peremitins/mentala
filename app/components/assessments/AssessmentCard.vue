<template>
  <article
    class="assessment-card glass-deep group relative cursor-pointer overflow-hidden rounded-lg p-5 transition duration-300 ease-out hover:-translate-y-0.5 hover:border-white/25"
    :style="{ animationDelay: `${index * 70}ms` }"
    role="button"
    tabindex="0"
    @click="$emit('open-detail', item)"
    @keydown.enter.prevent="$emit('open-detail', item)"
    @keydown.space.prevent="$emit('open-detail', item)"
  >
    <div class="relative flex h-full flex-col gap-4">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1">
          <p
            class="text-xs font-medium uppercase tracking-[0.12em] text-foreground/45"
          >
            {{ item.linkedProgramTitle }}
          </p>
          <h2 class="text-lg font-semibold leading-tight text-foreground">
            {{ item.title }}
          </h2>
        </div>
        <span
          class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium"
          :class="statusClass"
        >
          {{ statusLabel }}
        </span>
      </div>

      <div class="mt-auto flex flex-wrap items-center gap-2 text-xs">
        <span
          v-if="item.questionsCount"
          class="rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-foreground/65"
        >
          {{ item.questionsCount || '—' }} вопросов
        </span>
        <span
          class="rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-foreground/65"
        >
          около {{ item.estimatedMinutes }} минут
        </span>
      </div>

      <button
        v-if="item.lastAttempt"
        type="button"
        class="rounded-2xl border border-white/12 bg-white/[0.08] p-3 text-left transition hover:border-white/24 hover:bg-white/[0.12] active:scale-[0.99]"
        @click.stop="$emit('open-result', item)"
      >
        <span
          class="block text-xs font-medium uppercase tracking-[0.12em] text-foreground/45"
        >
          Последний результат
        </span>
        <span class="mt-1 block text-sm font-semibold text-foreground">
          {{ item.lastAttempt.totalScore }} баллов · {{ lastAttemptDate }}
        </span>
      </button>

      <div class="flex items-center justify-between gap-3 ml-auto">
        <button
          type="button"
          class="rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-[0.98]"
          :class="actionClass"
          :disabled="item.status !== 'active'"
          @click.stop="$emit('open-detail', item)"
        >
          {{ actionLabel }}
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AssessmentListItem } from '@/shared/dto/assessments';

const props = defineProps<{
  item: AssessmentListItem;
  index: number;
  locked: boolean;
}>();

defineEmits<{
  'open-detail': [item: AssessmentListItem];
  'open-result': [item: AssessmentListItem];
}>();

const statusLabel = computed(() => {
  if (props.item.status === 'active') return 'Доступен';
  if (props.item.status === 'locked_by_program_progress') {
    return 'Откроется по пути';
  }
  if (props.item.status === 'coming_soon') return 'Откроется позже';
  return 'Недоступен';
});

const statusClass = computed(() => {
  if (props.item.status === 'active') {
    return 'border-emerald-300/35 bg-emerald-300/14 text-emerald-100';
  }
  return 'border-white/10 bg-white/[0.08] text-foreground/55';
});

const actionLabel = computed(() => {
  if (props.item.status !== 'active') return props.item.lockedCopy.ctaText;
  return props.locked ? props.item.lockedCopy.ctaText : 'Открыть';
});

const actionClass = computed(() => {
  if (props.item.status !== 'active') {
    return 'cursor-not-allowed bg-white/[0.08] text-foreground/45';
  }
  if (props.locked) {
    return 'bg-white/10 text-foreground hover:bg-white/15';
  }
  return 'bg-foreground text-background hover:bg-foreground/90';
});

const lastAttemptDate = computed(() => {
  if (!props.item.lastAttempt) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(props.item.lastAttempt.completedAt));
});
</script>

<style scoped>
@keyframes assessment-card-in {
  from {
    opacity: 0;
    transform: translate3d(0, 14px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

.assessment-card {
  animation: assessment-card-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
</style>
