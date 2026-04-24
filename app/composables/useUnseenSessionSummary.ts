import { computed, ref } from 'vue';
import { useNuxtApp } from '#imports';
import { useAuthStore } from '@/app/stores/auth';
import type {
  SessionSummaryUserItemDtoType,
  UnseenSessionSummaryUserResponseDtoType,
} from '@/shared/dto/sessionSummaryUser';

const unseenSummary = ref<SessionSummaryUserItemDtoType | null>(null);
const isLoaded = ref(false);
const isLoading = ref(false);
const loadedUserId = ref<number | null>(null);

let pendingLoad: Promise<SessionSummaryUserItemDtoType | null> | null = null;

function syncUserScope(userId: number | null) {
  if (loadedUserId.value === userId) {
    return;
  }

  loadedUserId.value = userId;
  unseenSummary.value = null;
  isLoaded.value = false;
  isLoading.value = false;
  pendingLoad = null;
}

export function useUnseenSessionSummary() {
  const auth = useAuthStore();
  const { $api } = useNuxtApp();

  const hasUnseenSummary = computed(() => Boolean(unseenSummary.value));

  async function loadUnseenSummary(
    force = false
  ): Promise<SessionSummaryUserItemDtoType | null> {
    const userId = auth.user?.id ?? null;
    syncUserScope(userId);

    if (!userId) {
      unseenSummary.value = null;
      isLoaded.value = true;
      return null;
    }

    if (!force && isLoaded.value) {
      return unseenSummary.value;
    }

    if (pendingLoad) {
      return pendingLoad;
    }

    isLoading.value = true;
    pendingLoad = (async () => {
      try {
        const resp = await $api<UnseenSessionSummaryUserResponseDtoType>(
          '/api/session-summaries-user/unseen',
          { method: 'GET' }
        );
        unseenSummary.value = resp?.item ?? null;
        isLoaded.value = true;
        return unseenSummary.value;
      } finally {
        isLoading.value = false;
        pendingLoad = null;
      }
    })();

    return pendingLoad;
  }

  async function markUnseenSummaryViewed(
    id: number | null = unseenSummary.value?.id ?? null
  ) {
    if (!id) {
      return;
    }

    try {
      await $api(`/api/session-summaries-user/${id}/viewed`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('[useUnseenSessionSummary] Mark viewed failed:', error);
    } finally {
      // Локально убираем индикатор сразу, даже если серверный mark viewed
      // временно упал, чтобы UI не залипал в "непрочитанном" состоянии.
      if (unseenSummary.value?.id === id) {
        unseenSummary.value = null;
      }
      isLoaded.value = true;
    }
  }

  return {
    unseenSummary,
    hasUnseenSummary,
    isLoaded,
    isLoading,
    loadUnseenSummary,
    markUnseenSummaryViewed,
  };
}
