<template>
  <div
    class="relative h-full overflow-y-auto xs:space-y-3 space-y-1 pb-[110px] rounded-lg"
  >
    <PageHeader title="Коллекция мыслей" show-back-button @go-back="goBack" />

    <section v-if="loading" class="xs:space-y-3 space-y-1">
      <div
        v-for="index in 4"
        :key="index"
        class="glass-deep h-28 animate-pulse"
      />
    </section>

    <section
      v-else-if="items.length === 0"
      class="glass-deep flex min-h-[42vh] flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <div
        class="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-300/15 text-emerald-100"
        aria-hidden="true"
      >
        <IconBookmark class="h-6 w-6" />
      </div>
      <div class="space-y-1">
        <h1 class="text-xl font-semibold text-foreground">
          Здесь появятся сохранённые мысли
        </h1>
        <p class="text-sm text-foreground/70">
          Отмечай полезные карточки на главной, чтобы вернуться к ним позже.
        </p>
      </div>
      <NuxtLink
        to="/"
        class="inline-flex min-h-10 items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90"
      >
        На главную
      </NuxtLink>
    </section>

    <section v-else class="space-y-2">
      <article
        v-for="item in items"
        :key="item.id"
        class="glass-deep space-y-3 p-4"
      >
        <div class="flex items-start gap-3">
          <div
            class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-300/15 text-emerald-100"
            aria-hidden="true"
          >
            <IconSparkles class="h-4 w-4" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <p class="text-xs font-medium text-foreground/55">
              {{ formatEntryDate(item.entryDate) }}
            </p>
            <p class="text-sm leading-relaxed text-foreground/85">
              {{ item.text }}
            </p>
          </div>
        </div>

        <div class="flex justify-end">
          <button
            type="button"
            class="inline-flex min-h-9 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-foreground/75 transition hover:bg-white/10 disabled:opacity-60"
            :disabled="removingId === item.id"
            @click="removeSaved(item.id)"
          >
            <IconLoader
              v-if="removingId === item.id"
              class="h-4 w-4 animate-spin"
            />
            <IconBookmarkX v-else class="h-4 w-4" />
            <span>Убрать из коллекции</span>
          </button>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import IconBookmark from '~icons/lucide/bookmark';
import IconBookmarkX from '~icons/lucide/bookmark-x';
import IconLoader from '~icons/lucide/loader-2';
import IconSparkles from '~icons/lucide/sparkles';
import PageHeader from '@/app/components/PageHeader.vue';
import { useAPI } from '@/app/composables/useAPI';
import type {
  ThoughtCollectionItemDto,
  ThoughtCollectionResponseDto,
} from '@/shared/dto/retention';

const items = ref<ThoughtCollectionItemDto[]>([]);
const loading = ref(true);
const removingId = ref<number | null>(null);

function goBack() {
  void navigateTo('/');
}

function formatEntryDate(entryDate: string) {
  const [year, month, day] = entryDate.split('-').map(Number);
  if (!year || !month || !day) return entryDate;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

async function loadCollection() {
  const response = await useAPI<ThoughtCollectionResponseDto>(
    '/api/thoughts/collection',
    { suppressErrorToast: true }
  );
  items.value = response.items;
}

async function removeSaved(id: number) {
  if (removingId.value) return;
  removingId.value = id;

  try {
    await useAPI('/api/thought-of-the-day/save', {
      method: 'DELETE',
      body: { id },
      suppressErrorToast: true,
    });
    items.value = items.value.filter((item) => item.id !== id);
  } catch (error) {
    console.error('[ThoughtCollection] Не удалось убрать мысль:', error);
  } finally {
    removingId.value = null;
  }
}

onMounted(async () => {
  try {
    await loadCollection();
  } catch (error) {
    console.error('[ThoughtCollection] Не удалось загрузить коллекцию:', error);
  } finally {
    loading.value = false;
  }
});
</script>
