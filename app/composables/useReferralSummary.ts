import {
  computed,
  onMounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';
import {
  ReferralMeResponseDto,
  type ReferralMeResponse,
} from '@/shared/dto/referral';
import { useAPI } from '@/app/composables/useAPI';
import { copyToClipboard } from '@/app/composables/useCopyToClipboard';
import { shareContent } from '@/app/composables/useShareContent';
import { useToast } from '@/app/composables/useToast';

type UseReferralSummaryOptions = {
  visible?: MaybeRefOrGetter<boolean | undefined>;
  refreshKey?: MaybeRefOrGetter<unknown>;
};

export function formatReferralDate(value?: string | null) {
  if (!value) return 'без срока';

  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatReferralAmount(value?: number | null) {
  return `${Number(value || 0).toFixed(2)} ₽`;
}

export function useReferralSummary(options: UseReferralSummaryOptions = {}) {
  const isVisible = computed(() => {
    const value = toValue(options.visible);
    return typeof value === 'boolean' ? value : true;
  });
  const isMounted = ref(false);
  const loading = ref(isVisible.value);
  const summary = ref<ReferralMeResponse | null>(null);

  async function loadSummary() {
    loading.value = true;

    try {
      const response = await useAPI<ReferralMeResponse>('/api/referral/me', {
        method: 'GET',
      });
      const parsed = ReferralMeResponseDto.parse(response);
      summary.value = parsed.available === false ? null : parsed;
    } catch {
      summary.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function handleCopyCode() {
    if (!summary.value?.myCode) return;

    const copied = await copyToClipboard(summary.value.myCode);
    if (copied) {
      useToast('Код скопирован', 'Можно отправить другу.');
      return;
    }

    useToast('Ошибка', 'Не удалось скопировать код.', 'error');
  }

  async function handleShareCode() {
    if (!summary.value?.myCode) return;

    const shareText = `Мой промокод Mentala: ${summary.value.myCode}`;
    const result = await shareContent({
      title: 'Промокод Mentala',
      text: shareText,
      dialogTitle: 'Поделиться промокодом',
      fallbackText: shareText,
    });

    if (result === 'shared' || result === 'cancelled') {
      return;
    }

    if (result === 'copied') {
      useToast(
        'Текст приглашения скопирован',
        'На этом устройстве системный share-sheet недоступен, поэтому текст просто скопирован.'
      );
      return;
    }

    useToast('Ошибка', 'Не удалось подготовить приглашение.', 'error');
  }

  onMounted(() => {
    isMounted.value = true;

    if (isVisible.value) {
      void loadSummary();
      return;
    }

    if (!isVisible.value) {
      loading.value = false;
    }
  });

  watch(
    () => [toValue(options.refreshKey), isVisible.value],
    ([, visible]) => {
      if (!isMounted.value) {
        return;
      }

      if (!visible) {
        loading.value = false;
        return;
      }

      void loadSummary();
    }
  );

  return {
    loading,
    summary,
    loadSummary,
    handleCopyCode,
    handleShareCode,
  };
}
