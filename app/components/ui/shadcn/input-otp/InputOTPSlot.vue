<template>
  <div
    :class="
      cn(
        'relative flex h-14 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-2xl font-semibold text-foreground shadow-inner shadow-white/5 transition-all',
        'group-hover:border-white/25 group-focus-within:border-white/30',
        isActive && 'z-10 border-primary/70 bg-white/15 ring-2 ring-primary/40',
        props.class
      )
    "
  >
    <span v-if="char" class="h-2.5 w-2.5 rounded-full bg-foreground" />
    <span
      v-else-if="hasFakeCaret || isActive"
      class="h-7 w-px animate-pulse bg-primary"
    />
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { SlotProps } from 'vue-input-otp';
import { cn } from '@/app/lib/utils';

const props = defineProps<
  SlotProps & {
    class?: HTMLAttributes['class'];
  }
>();
</script>
