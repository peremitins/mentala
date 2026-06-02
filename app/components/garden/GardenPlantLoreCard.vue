<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      v-if="plant"
      class="glass-deep border border-border bg-card text-card-foreground"
    >
      <DialogHeader class="space-y-1">
        <DialogTitle class="text-lg font-semibold">
          {{ plant.title }}
        </DialogTitle>
        <DialogDescription
          v-if="completedDate"
          class="text-xs text-foreground/55"
        >
          Завершён {{ completedDate }}
        </DialogDescription>
      </DialogHeader>

      <!-- Большое изображение растения. Кнопка-обёртка открывает PhotoSwipe
           для pinch-to-zoom (та же механика, что в дневнике благодарности). -->
      <button
        type="button"
        class="mx-auto flex h-40 w-40 cursor-zoom-in items-center justify-center rounded-3xl bg-white/[0.03] p-3 transition active:scale-[0.98]"
        :aria-label="`Увеличить растение «${plant.title}»`"
        @click="openZoom"
      >
        <img
          :src="imageSrc"
          :alt="plant.title"
          class="max-h-full max-w-full object-contain"
          loading="lazy"
          decoding="async"
        />
      </button>

      <!-- AI-итог лор-карточки. Полноценный markdown-разбор (заголовки,
           списки рекомендаций, якорь на будущее). См. retention/retention_long_term_strategy.md -->
      <div
        v-if="displaySummary"
        class="garden-lore-markdown text-sm leading-relaxed text-foreground/85"
        v-html="renderedSummary"
      />
      <p
        v-else-if="isLoadingSummary"
        class="animate-pulse text-sm leading-relaxed text-foreground/40"
      >
        Готовим подробный разбор сада…
      </p>

      <!-- Сохранённые мысли периода — превью текстов (1-3 шт.) с ссылкой в
           коллекцию (см. retention/retention_long_term_strategy.md). Тексты приходят
           вместе с GardenResponseDto в `plant.savedThoughts`. -->
      <section
        v-if="savedThoughtsPreview.length > 0"
        class="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2"
      >
        <p
          class="text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
        >
          Сохранённые мысли периода
        </p>
        <ul class="space-y-2">
          <li
            v-for="thought in savedThoughtsPreview"
            :key="thought.id"
            class="rounded-xl bg-white/[0.04] px-3 py-2"
          >
            <p class="text-xs leading-relaxed text-foreground/80">
              {{ thought.text }}
            </p>
          </li>
        </ul>
        <NuxtLink
          to="/thoughts"
          class="inline-flex text-xs font-medium text-emerald-200 hover:text-emerald-100"
        >
          Все сохранённые мысли →
        </NuxtLink>
      </section>

      <div class="flex items-center justify-end pt-2">
        <Button type="button" variant="ghost" @click="onClose">
          Закрыть
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { usePhotoSwipe } from '@/app/composables/usePhotoSwipe';
import { useAPI } from '@/app/composables/useAPI';
import { useMarkdown } from '@/app/composables/useMarkdown';
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';
import type { GardenPlantItemDto } from '@/shared/dto/garden';

/**
 * Лор-карточка завершённого растения (см. retention/retention_long_term_strategy.md).
 * Открывается тапом на карточке в коллекции. Содержит:
 *   - большое изображение растения (PhotoSwipe-zoom);
 *   - название Сада + дата завершения;
 *   - лор-текст (summaryText из user_plants.userSummary);
 *   - подсказку про сохранённые мысли с ссылкой в /thoughts (если есть).
 *
 * AI-сгенерированная финальная цитата по теме Сада подключается отдельно
 * (Этап после стабилизации первой коллекции).
 */

const props = defineProps<{
  open: boolean;
  plant: GardenPlantItemDto | null;
}>();
const emit = defineEmits<{ (e: 'update:open', open: boolean): void }>();

const { openPhotoSwipe } = usePhotoSwipe();

const imageSrc = computed(() => {
  if (!props.plant) return '';
  // 15 стадий растения (1..15), helper использует 0-based. Clamp до 14
  // защищает от out-of-bounds на старых записях со stateIndex=16.
  const safeIndex = Math.max(0, Math.min(14, props.plant.stateIndex - 1));
  return getRetentionPlantImageSrc(safeIndex, props.plant.plantSetSlug);
});

const completedDate = computed(() => {
  if (!props.plant?.completedAt) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(props.plant.completedAt));
  } catch {
    return '';
  }
});

// Превью сохранённых мыслей — берём первые 3, чтобы карточка не разрасталась
// при долгой программе с десятками сохранений.
const savedThoughtsPreview = computed(
  () => props.plant?.savedThoughts?.slice(0, 3) ?? []
);

// AI-цитата для лор-карточки. summaryText приходит с сервера в plant.summaryText,
// но на свежих завершениях он может быть пустым (LLM ещё не вызывался).
// При открытии карточки делаем ленивый fetch к
// `/api/garden/plants/:id/refresh-summary` — серверная логика сама решит,
// генерировать или вернуть кэш.
const fetchedSummary = ref<string | null>(null);
const isLoadingSummary = ref(false);
const displaySummary = computed(() => {
  if (fetchedSummary.value) return fetchedSummary.value;
  return props.plant?.summaryText || '';
});

const { renderMarkdown } = useMarkdown();
const renderedSummary = computed(() => renderMarkdown(displaySummary.value));

watch(
  () => [props.open, props.plant?.id] as const,
  async ([isOpen, plantId]) => {
    if (!isOpen || !plantId) return;
    // Если на сервере уже есть текст — больше ничего не делаем.
    if (props.plant?.summaryText && props.plant.summaryText.trim().length > 0) {
      fetchedSummary.value = props.plant.summaryText;
      return;
    }
    if (isLoadingSummary.value) return;
    isLoadingSummary.value = true;
    try {
      const result = await useAPI<{
        summaryText: string;
        generated: boolean;
      }>(`/api/garden/plants/${plantId}/refresh-summary`, {
        method: 'POST',
        suppressErrorToast: true,
      });
      fetchedSummary.value = result.summaryText;
    } catch (error) {
      console.error('[GardenPlantLoreCard] fetch summary failed:', error);
    } finally {
      isLoadingSummary.value = false;
    }
  },
  { immediate: true }
);

function openZoom() {
  if (!props.plant) return;
  void openPhotoSwipe([
    {
      src: imageSrc.value,
      width: 1200,
      height: 1200,
      alt: props.plant.title,
    },
  ]);
}

function onOpenChange(value: boolean) {
  emit('update:open', value);
}

function onClose() {
  emit('update:open', false);
}
</script>

<style scoped>
/* Markdown-вёрстка AI-итога. Заголовки, списки, акценты — все приглушённо,
   без визуального шума на лор-карточке. */
.garden-lore-markdown :deep(h2) {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground) / 0.95);
  margin-top: 16px;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.garden-lore-markdown :deep(h2):first-child {
  margin-top: 0;
}

.garden-lore-markdown :deep(h3) {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground) / 0.85);
  margin-top: 12px;
  margin-bottom: 4px;
}

.garden-lore-markdown :deep(p) {
  margin: 6px 0;
  line-height: 1.55;
}

.garden-lore-markdown :deep(ul),
.garden-lore-markdown :deep(ol) {
  margin: 6px 0;
  padding-left: 18px;
}

.garden-lore-markdown :deep(li) {
  margin: 4px 0;
  line-height: 1.5;
}

.garden-lore-markdown :deep(strong) {
  color: hsl(var(--foreground));
  font-weight: 600;
}

.garden-lore-markdown :deep(em) {
  font-style: italic;
  color: hsl(var(--foreground) / 0.8);
}
</style>
