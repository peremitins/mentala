<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import type { SuggestedChip } from '@/shared/dto';

const props = defineProps<{
  chips: SuggestedChip[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', chip: SuggestedChip): void;
}>();

// Прокидываем выбор чипа наружу.
const handleSelect = (chip: SuggestedChip) => {
  if (props.disabled) return;
  emit('select', chip);
};
</script>

<template>
  <div v-if="props.chips.length" class="flex flex-wrap gap-2">
    <Button
      v-for="chip in props.chips"
      :key="`${chip.intent}-${chip.text}`"
      variant="outline"
      size="sm"
      :disabled="props.disabled"
      class="group rounded-full glass-deep border-white/10 bg-white/10 text-foreground/90 shadow-sm backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20 hover:text-foreground active:translate-y-0 active:scale-[0.98]"
      @click="handleSelect(chip)"
    >
      <span class="text-[13px] leading-tight">{{ chip.text }}</span>
    </Button>
  </div>
</template>
