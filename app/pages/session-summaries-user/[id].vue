<template>
  <div class="space-y-3 relative h-full overflow-y-auto pb-[100px] rounded-lg">
    <PageHeader
      title="Итог сессии"
      :show-back-button="true"
      @go-back="goBack"
    />

    <div class="glass-deep p-3 space-y-4">
      <!-- Loading (первоначальная загрузка) -->
      <div v-if="isLoading" class="space-y-3">
        <div
          class="rounded-2xl border border-white/10 bg-background/20 p-3 animate-pulse"
        >
          <div class="h-3 w-24 bg-white/10 rounded mb-3" />
          <div class="h-3 w-full bg-white/10 rounded mb-2" />
          <div class="h-3 w-3/4 bg-white/10 rounded" />
        </div>
      </div>

      <!-- Error (сетевая / 404) -->
      <div
        v-else-if="errorMessage"
        class="rounded-2xl border border-red-500/30 bg-background/20 p-3"
      >
        <p class="text-sm text-red-200">{{ errorMessage }}</p>
        <NuxtLink
          to="/session-summaries-user"
          class="inline-flex mt-3 text-xs text-foreground/80 underline decoration-white/30 underline-offset-4 transition hover:text-foreground"
        >
          Назад к списку
        </NuxtLink>
      </div>

      <!-- Pending: итог генерируется, ожидаем -->
      <div v-else-if="isPending" class="space-y-3">
        <div
          class="rounded-2xl border border-white/10 bg-background/20 p-3 animate-pulse"
        >
          <div class="h-3 w-32 bg-white/10 rounded mb-3" />
          <div class="h-3 w-full bg-white/10 rounded mb-2" />
          <div class="h-3 w-4/5 bg-white/10 rounded mb-2" />
          <div class="h-3 w-2/3 bg-white/10 rounded" />
        </div>
        <div
          class="rounded-2xl border border-white/10 bg-background/20 p-3 animate-pulse"
        >
          <div class="h-3 w-28 bg-white/10 rounded mb-3" />
          <div class="h-3 w-full bg-white/10 rounded mb-2" />
          <div class="h-3 w-3/4 bg-white/10 rounded" />
        </div>
        <p class="text-center text-xs text-foreground/40 pb-2">
          Формируем итог сессии…
        </p>
      </div>

      <!-- Failed: итог не удалось сформировать -->
      <div
        v-else-if="isFailed"
        class="rounded-2xl border border-red-500/30 bg-background/20 p-4 space-y-3"
      >
        <p class="text-sm font-medium text-foreground">
          Не удалось сформировать итог
        </p>
        <p class="text-xs text-foreground/60 leading-relaxed">
          Что-то пошло не так при обработке сессии.
        </p>
        <NuxtLink
          to="/session-summaries-user"
          class="inline-flex text-xs text-foreground/80 underline decoration-white/30 underline-offset-4 transition hover:text-foreground"
        >
          Назад к списку
        </NuxtLink>
      </div>

      <!-- Content (completed) -->
      <template v-else-if="item && isCompleted">
        <!-- Meta -->
        <div class="rounded-2xl border border-white/10 bg-background/20 p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs text-foreground/60">
                {{ formatSessionSummaryDisplayDate(item) }}
              </p>
              <p class="text-xs text-foreground/60 mt-1">
                {{ item.messagesCount }} сообщений
              </p>
            </div>
          </div>
        </div>

        <!-- Short summary -->
        <section
          class="rounded-2xl border border-white/10 bg-background/20 p-3"
        >
          <h3
            class="text-[10px] uppercase tracking-[0.08em] text-foreground/60 mb-2"
          >
            О чем была эта сессия
          </h3>
          <p
            class="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
          >
            {{ item.summary.shortSummary }}
          </p>
        </section>

        <!-- Key points -->
        <section
          v-if="item.summary.keyPoints?.length"
          class="rounded-2xl border border-white/10 bg-background/20 p-3"
        >
          <h3
            class="text-[10px] uppercase tracking-[0.08em] text-foreground/60 mb-2"
          >
            Что было важным
          </h3>
          <ul class="space-y-2">
            <li
              v-for="(point, idx) in item.summary.keyPoints"
              :key="idx"
              class="flex gap-2 text-sm text-foreground leading-relaxed"
            >
              <span class="select-none text-foreground/65">•</span>
              <span>{{ point }}</span>
            </li>
          </ul>
        </section>

        <!-- Next steps -->
        <section
          v-if="item.summary.nextSteps?.length"
          class="rounded-2xl border border-white/12 bg-white/[0.03] p-3"
        >
          <h3
            class="mb-2 text-[10px] uppercase tracking-[0.08em] text-foreground/70"
          >
            Следующие шаги
          </h3>
          <ul class="space-y-2">
            <li
              v-for="(step, idx) in item.summary.nextSteps"
              :key="idx"
              class="flex gap-2 text-sm text-foreground leading-relaxed"
            >
              <span class="select-none text-foreground/70">→</span>
              <span>{{ step }}</span>
            </li>
          </ul>
        </section>

        <!-- Actions -->
        <div class="flex gap-2 pt-2">
          <NuxtLink
            to="/chat"
            class="flex-1 inline-flex items-center justify-center rounded-lg bg-primary-ui px-4 py-2.5 text-sm font-medium text-background shadow-[0_14px_34px_rgba(255,255,255,0.12)] transition hover:bg-primary-ui/90"
          >
            Продолжить в чате
          </NuxtLink>
          <NuxtLink
            to="/session-summaries-user"
            class="inline-flex items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm text-foreground transition hover:bg-white/5"
          >
            К списку
          </NuxtLink>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNuxtApp } from '#imports';
import PageHeader from '@/app/components/PageHeader.vue';
import type {
  GetSessionSummaryUserResponseDtoType,
  SessionSummaryUserItemDtoType,
} from '@/shared/dto/sessionSummaryUser';
import { formatSessionSummaryDisplayDate } from '@/app/utils/session-summary-date';

// Доступ проверяется глобальным auth.global.ts — отдельная middleware не нужна.

// Максимум 60 секунд поллинга (20 попыток × 3 секунды) — если за это время
// итог не готов, скорее всего что-то пошло не так.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

const route = useRoute();
const router = useRouter();
const { $api } = useNuxtApp();

const item = ref<SessionSummaryUserItemDtoType | null>(null);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollAttempts = 0;

// Вычисляемые состояния для удобства шаблона.
const isPending = computed(() => item.value?.status === 'pending');
const isFailed = computed(() => item.value?.status === 'failed');
const isCompleted = computed(() => item.value?.status === 'completed');

function stopPolling() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function fetchItem(id: number): Promise<void> {
  const resp = await $api<GetSessionSummaryUserResponseDtoType>(
    `/api/session-summaries-user/${id}`,
    { method: 'GET' }
  );
  item.value = resp.item;
}

async function loadItem() {
  const id = Number(route.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    errorMessage.value = 'Некорректный идентификатор итога.';
    return;
  }

  isLoading.value = true;
  errorMessage.value = null;
  try {
    await fetchItem(id);

    // Если итог уже готов — помечаем просмотренным.
    if (item.value && isCompleted.value && !item.value.viewedAt) {
      $api(`/api/session-summaries-user/${id}/viewed`, {
        method: 'POST',
      }).catch(() => {
        // silent — не критично для UX
      });
    }

    // Если итог ещё генерируется — запускаем поллинг.
    if (item.value && isPending.value) {
      pollAttempts = 0;
      schedulePoll(id);
    }
  } catch (error: unknown) {
    console.error('[SessionSummaryUserDetail] Load failed:', error);
    const status =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 404) {
      errorMessage.value = 'Итог не найден.';
    } else {
      errorMessage.value = 'Не удалось загрузить итог. Попробуй позже.';
    }
  } finally {
    isLoading.value = false;
  }
}

function schedulePoll(id: number) {
  stopPolling();
  pollTimer = setTimeout(() => void pollItem(id), POLL_INTERVAL_MS);
}

async function pollItem(id: number) {
  pollAttempts++;
  try {
    await fetchItem(id);

    if (isCompleted.value) {
      // Итог готов — помечаем просмотренным и останавливаем поллинг.
      if (item.value && !item.value.viewedAt) {
        $api(`/api/session-summaries-user/${id}/viewed`, {
          method: 'POST',
        }).catch(() => {});
      }
      stopPolling();
      return;
    }

    if (isFailed.value) {
      // Ошибка генерации — останавливаем поллинг, покажется блок ошибки.
      stopPolling();
      return;
    }

    // Всё ещё pending: продолжаем если не исчерпали лимит попыток.
    if (pollAttempts >= POLL_MAX_ATTEMPTS) {
      console.warn('[SessionSummaryUserDetail] Поллинг исчерпал лимит попыток');
      stopPolling();
      return;
    }

    schedulePoll(id);
  } catch (error) {
    console.error('[SessionSummaryUserDetail] Ошибка поллинга:', error);
    // При сетевой ошибке не прекращаем поллинг — попробуем ещё.
    if (pollAttempts < POLL_MAX_ATTEMPTS) {
      schedulePoll(id);
    }
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    void router.push('/session-summaries-user');
  }
}

onMounted(() => {
  void loadItem();
});

onUnmounted(() => {
  stopPolling();
});
</script>
