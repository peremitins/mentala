<template>
  <div
    class="glass-deep sticky top-0 flex min-h-[50px] items-center py-2 z-50"
    :style="isMeditationPlayer ? { backdropFilter: 'blur(1px)' } : undefined"
  >
    <div class="flex items-center w-full gap-3">
      <div class="flex items-center min-w-0 flex-1">
        <Button
          v-if="props.showBackButton"
          class="h-8 w-8 flex-shrink-0 hover:bg-primary/10"
          variant="ghost"
          size="icon"
          @click="handleGoBack"
        >
          <IconChevronLeft />
        </Button>

        <div
          v-if="$slots.custom"
          class="overflow-hidden min-w-0 flex-1 pr-2"
        >
          <slot name="custom" />
        </div>
        <h1
          v-else
          class="text-xl font-bold text-foreground flex-1 truncate"
          :class="{ 'px-4': !props.showBackButton }"
        >
          {{ props.title }}
        </h1>
      </div>
      <HeaderSettingsMenu />
    </div>
  </div>
</template>

<script lang="ts" setup>
import IconChevronLeft from '~icons/lucide/chevron-left';
import { useRoute } from 'vue-router';
import HeaderSettingsMenu from '@/app/components/HeaderSettingsMenu.vue';

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

const detailTrackId = computed(() => {
  const raw = route.query.trackId;
  if (Array.isArray(raw)) return raw[0]?.trim() || '';
  if (typeof raw === 'string') return raw.trim();
  return '';
});

// Размываем нижнюю панель только на странице плеера медитации.
const isMeditationPlayer = computed(() => {
  return route.path.startsWith('/meditations') && Boolean(detailTrackId.value);
});
</script>
