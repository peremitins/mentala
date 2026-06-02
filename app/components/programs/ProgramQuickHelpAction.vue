<template>
  <ProgramBreathPracticeAction
    v-if="action.type === 'quick_help_breathing'"
    :action="action"
    @complete="emit('complete')"
    @start="emit('start')"
    @pause="emit('pause')"
    @stop="emit('stop')"
  />

  <QuickHelpGroundingPractice
    v-else-if="action.type === 'quick_help_grounding'"
    @complete="emit('complete')"
  />

  <QuickHelpTensionPractice
    v-else-if="action.type === 'quick_help_tension'"
    :session-minutes="roadmapSessionMinutes"
    :auto-start="true"
    :show-settings="true"
    :overlay-z-index="80"
    settings-dialog-class="z-[100]"
    settings-overlay-class="z-[90]"
    @complete="emit('complete')"
    @start="emit('start')"
    @pause="emit('pause')"
    @stop="emit('stop')"
  />
</template>

<script setup lang="ts">
import ProgramBreathPracticeAction from '@/app/components/programs/ProgramBreathPracticeAction.vue';
import QuickHelpGroundingPractice from '@/app/components/quick-help/QuickHelpGroundingPractice.vue';
import QuickHelpTensionPractice from '@/app/components/quick-help/QuickHelpTensionPractice.vue';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

defineProps<{
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'start'): void;
  (e: 'pause'): void;
  (e: 'stop'): void;
}>();

const ROADMAP_PRACTICE_SESSION_MINUTES = 60;
const roadmapSessionMinutes = ROADMAP_PRACTICE_SESSION_MINUTES;
</script>
