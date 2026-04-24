<template>
  <div class="space-y-3 relative h-full overflow-y-auto pb-[100px] rounded-lg">
    <PageHeader
      title="Итоги сессий"
      :show-back-button="true"
      @go-back="goBack"
    />

    <div class="">
      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-3">
        <div v-for="n in 3" :key="n" class="glass-deep p-4 animate-pulse">
          <div class="h-4 w-24 bg-white/10 rounded mb-3" />
          <div class="h-3 w-full bg-white/10 rounded mb-2" />
          <div class="h-3 w-3/4 bg-white/10 rounded" />
        </div>
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!items.length && !errorMessage"
        class="glass-deep p-6 text-center"
      >
        <p class="text-foreground font-medium mb-1">Здесь пока пусто</p>
        <p class="text-sm text-foreground/70 leading-relaxed">
          Итог появится после содержательной сессии в чате
        </p>
        <NuxtLink
          to="/chat"
          class="inline-flex items-center gap-2 rounded-full bg-foreground/90 mt-3 px-5 py-2.5 text-sm font-medium text-background transition hover:bg-foreground"
        >
          <IconSend class="h-4 w-4" />

          <span>Перейти в чат</span>
        </NuxtLink>
      </div>

      <!-- Error -->
      <div
        v-else-if="errorMessage"
        class="glass-deep p-4 border border-red-500/30"
      >
        <p class="text-sm text-red-200">{{ errorMessage }}</p>
        <button
          type="button"
          class="mt-3 text-xs text-foreground/80 underline decoration-white/30 underline-offset-4 transition hover:text-foreground"
          @click="loadItems"
        >
          Повторить
        </button>
      </div>

      <!-- List -->
      <ul v-else class="space-y-3">
        <li
          v-for="item in items"
          :key="item.id"
          class="glass-deep p-4 cursor-pointer transition hover:bg-white/5"
          @click="openItem(item.id)"
        >
          <div class="flex items-center justify-between gap-3 mb-2">
            <p class="text-xs text-foreground/60">
              {{ formatDate(item.sessionEndedAt || item.createdAt) }}
            </p>
            <UnreadSummaryBadge v-if="!item.viewedAt" />
          </div>

          <p class="text-sm text-foreground leading-relaxed line-clamp-3">
            {{ item.summary.shortSummary }}
          </p>

          <div class="flex items-center gap-3 mt-3 text-xs text-foreground/60">
            <span>{{ item.messagesCount }} сообщений</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNuxtApp } from '#imports';
import PageHeader from '@/app/components/PageHeader.vue';
import UnreadSummaryBadge from '@/app/components/sessionSummaries/UnreadSummaryBadge.vue';
import type {
  ListSessionSummariesUserResponseDtoType,
  SessionSummaryUserItemDtoType,
} from '@/shared/dto/sessionSummaryUser';
import IconSend from '~icons/lucide/send';

// Доступ проверяется глобальным auth.global.ts — отдельная middleware не нужна.

const router = useRouter();
const { $api } = useNuxtApp();

const items = ref<SessionSummaryUserItemDtoType[]>([]);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function loadItems() {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    const resp = await $api<ListSessionSummariesUserResponseDtoType>(
      '/api/session-summaries-user',
      { method: 'GET', query: { page: 1, pageSize: 50 } }
    );
    items.value = resp.items || [];
  } catch (error) {
    console.error('[SessionSummariesUserList] Load failed:', error);
    errorMessage.value = 'Не удалось загрузить итоги. Попробуй позже.';
  } finally {
    isLoading.value = false;
  }
}

function openItem(id: number) {
  void router.push(`/session-summaries-user/${id}`);
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    void router.push('/');
  }
}

// "22 апр, 14:30" — коротко и читаемо.
function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return iso;
  }
}

onMounted(() => {
  void loadItems();
});
</script>
