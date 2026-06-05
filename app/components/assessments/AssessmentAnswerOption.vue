<template>
  <button
    type="button"
    class="group flex min-h-[56px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition duration-200 ease-out active:scale-[0.99]"
    :class="
      selected
        ? 'border-foreground bg-foreground text-background shadow-[0_18px_42px_-28px_rgba(24,24,27,0.55)]'
        : 'border-white/10 bg-white/[0.08] text-foreground hover:border-white/24 hover:bg-white/[0.12]'
    "
    :aria-pressed="selected"
  >
    <span
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition"
      :class="
        selected
          ? 'border-background/35 bg-background/15 text-background'
          : 'border-foreground/10 bg-foreground/[0.04] text-foreground/55 group-hover:text-foreground'
      "
    >
      {{ index + 1 }}
    </span>
    <span class="min-w-0 flex-1 text-sm font-medium leading-snug">
      {{ label }}
    </span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  selected: boolean;
  index: number;
}>();
</script>
