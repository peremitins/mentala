<template>
  <div
    class="glass-deep sticky top-0 flex min-h-[50px] items-center py-2 z-50"
    :style="isMeditationPlayer ? { backdropFilter: 'blur(1px)' } : undefined"
  >
    <div class="flex items-center w-full gap-3">
      <div class="flex items-center min-w-0 flex-1">
        <Button
          v-if="props.showBackButton"
          class="h-8 w-8 flex-shrink-0 hover:bg-primary-ui/10"
          variant="ghost"
          size="icon"
          @click="handleGoBack"
        >
          <IconChevronLeft />
        </Button>

        <div v-if="$slots.custom" class="overflow-hidden min-w-0 flex-1 pr-2">
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
      <div class="mr-2 flex items-center gap-2">
        <button
          v-if="route.path !== '/quick-help'"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-foreground/80 transition hover:border-white/20 hover:text-foreground"
          aria-label="Быстрая помощь"
          @click="openQuickHelp"
        >
          <IconHeartPulse class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-foreground/80 transition hover:border-white/20 hover:text-foreground"
          aria-label="Настройки атмосферы"
          @click="openSceneSelection"
        >
          <IconSlidersHorizontal class="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconHeartPulse from '~icons/lucide/heart-pulse';
import IconSlidersHorizontal from '~icons/lucide/sliders-horizontal';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

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

const openSceneSelection = async () => {
  // Открываем страницу настроек атмосферы напрямую.
  await router.push('/scene-selection');
};

function openQuickHelp() {
  void router.push('/quick-help');
}

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
