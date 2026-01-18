<template>
  <div
    class="glass-deep sticky top-0 flex min-h-[50px] items-center py-2 z-50"
    :style="isMeditationPlayer ? { backdropFilter: 'blur(1px)' } : undefined"
  >
    <div class="flex items-center w-full">
      <Button
        v-if="props.showBackButton"
        class="h-8 w-8 flex-shrink-0 hover:bg-primary/10"
        variant="ghost"
        size="icon"
        @click="handleGoBack"
      >
        <IconChevronLeft />
      </Button>

      <div v-if="$slots.custom" class="overflow-hidden w-full pr-2">
        <slot name="custom" />
      </div>
      <h1
        v-else
        class="text-xl font-bold text-foreground w-full truncate"
        :class="{ 'px-4': !props.showBackButton }"
      >
        {{ props.title }}
      </h1>
    </div>
  </div>
</template>

<script lang="ts" setup>
import IconChevronLeft from '~icons/lucide/chevron-left';
import { useRoute } from 'vue-router';

const route = useRoute();

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

// Размываем нижнюю панель только на странице плеера медитации.
const isMeditationPlayer = computed(() => {
  return route.path.startsWith('/meditations/') && Boolean(route.params?.id);
});
</script>
