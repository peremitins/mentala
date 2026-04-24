<template>
  <Badge variant="outline" :class="badgeClass">
    <UnreadSummaryIndicator :compact="compact" />
    <span>{{ label }}</span>
  </Badge>
</template>

<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue';
import { Badge } from '@/app/components/ui/shadcn/badge';
import { cn } from '@/app/lib/utils';
import UnreadSummaryIndicator from '@/app/components/sessionSummaries/UnreadSummaryIndicator.vue';

const props = withDefaults(
  defineProps<{
    label?: string;
    compact?: boolean;
    class?: HTMLAttributes['class'];
  }>(),
  {
    label: 'Новое',
    compact: false,
  }
);

const badgeClass = computed(() =>
  cn(
    'rounded-full border-white/15 bg-white/10 text-foreground/95 shadow-[0_12px_32px_rgba(15,23,42,0.22)] backdrop-blur-md',
    props.compact
      ? 'gap-1 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]'
      : 'gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
    props.class
  )
);
</script>
