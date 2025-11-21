<template>
  <div class="glass-deep sticky top-0 flex min-h-[50px] items-center py-2 z-50">
    <div class="flex items-center">
      <Button
        v-if="props.showBackButton"
        class="h-8 w-8 flex-shrink-0"
        variant="ghost"
        size="icon"
        @click="handleGoBack"
      >
        <IconChevronLeft />
      </Button>

      <div v-if="$slots.custom" class="overflow-hidden">
        <slot name="custom" />
      </div>
      <h1
        v-else
        class="text-xl font-bold text-gray-900 dark:text-gray-100 w-full truncate px-4"
      >
        {{ props.title }}
      </h1>
    </div>
  </div>
</template>

<script lang="ts" setup>
import IconChevronLeft from '~icons/lucide/chevron-left';

interface Props {
  title: string;
  showBackButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showBackButton: false,
});

const emit = defineEmits<{
  (e: 'go-back'): void;
}>();

const handleGoBack = () => {
  emit('go-back');
};
</script>
