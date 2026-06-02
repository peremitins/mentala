<template>
  <div class="space-y-4">
    <ProgramFormattedPrompt
      v-if="question"
      :text="question"
      class="text-sm leading-relaxed text-foreground/80"
    />

    <div class="grid gap-2">
      <button
        v-for="option in options"
        :key="option"
        type="button"
        class="flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition active:scale-[0.98]"
        :class="
          modelValue === option
            ? 'border-emerald-200/45 bg-emerald-300/18 text-foreground'
            : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
        "
        @click="emit('update:modelValue', option)"
      >
        <IconCheckCircle
          class="h-4 w-4 shrink-0"
          :class="modelValue === option ? 'text-emerald-200' : 'text-white/30'"
          aria-hidden="true"
        />
        <span>{{ option }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconCheckCircle from '~icons/lucide/check-circle';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

const props = defineProps<{
  modelValue: string | null;
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const question = computed(
  () => props.action.chipQuestion || props.action.prompt || null
);
const options = computed(() => props.action.chipOptions ?? []);
</script>
