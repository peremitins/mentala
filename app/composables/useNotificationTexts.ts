import type {
  NotificationText,
  BatchTextsRequest,
  ResetTextsRequest,
  NotificationSubtype,
  Directness,
} from '@/shared/dto/notifications';
import { useToast } from './useToast';

export function useNotificationTexts(
  kind: 'habits' | 'therapy',
  entityKey: string
) {
  const texts = ref<NotificationText[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  /**
   * Загрузить тексты для сущности с фильтрами
   */
  async function fetchTexts(
    options: {
      subtype?: NotificationSubtype | null;
      directness?: Directness | null;
      includeDeletedDefaults?: boolean;
      includeUserDeleted?: boolean;
    } = {}
  ) {
    loading.value = true;
    try {
      const body: Record<string, any> = {
        kind,
        entityKey,
      };

      if (options.subtype) {
        body.subtype = options.subtype;
      }
      if (options.directness) {
        body.directness = options.directness;
      }
      if (options.includeDeletedDefaults) {
        body.includeDeletedDefaults = true;
      }
      if (options.includeUserDeleted) {
        body.includeUserDeleted = true;
      }

      const nuxtApp = useNuxtApp();
      const data = await nuxtApp.$api<{ items: NotificationText[] }>(
        '/api/notifications/texts',
        {
          method: 'POST',
          body,
        }
      );

      if (data) {
        texts.value = data.items;
      }
    } catch (error) {
      console.error('Failed to fetch texts:', error);
      useToast('Ошибка загрузки текстов', undefined, 'error');
    } finally {
      loading.value = false;
    }
  }

  /**
   * Сохранить изменения (batch)
   */
  async function saveChanges(changes: BatchTextsRequest['changes']) {
    saving.value = true;
    try {
      const nuxtApp = useNuxtApp();
      const data = await nuxtApp.$api<{ items: NotificationText[] }>(
        '/api/notifications/texts/batch',
        {
          method: 'PUT',
          body: {
            kind,
            entityKey,
            changes,
          },
        }
      );

      if (data) {
        texts.value = data.items;
        useToast('Изменения сохранены', undefined, 'success');
        return true;
      }
      return false;
    } catch (error: any) {
      console.error('Failed to save changes:', error);
      useToast(
        'Ошибка сохранения',
        error?.data?.message || 'Не удалось сохранить изменения',
        'error'
      );
      return false;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Вернуть тексты по умолчанию
   */
  async function resetDefaults(keepUserTexts = true) {
    saving.value = true;
    try {
      const nuxtApp = useNuxtApp();
      await nuxtApp.$api<{ restoredDefaults: number; userTextsKept: boolean }>(
        '/api/notifications/texts/reset',
        {
          method: 'POST',
          body: {
            kind,
            entityKey,
            keepUserTexts,
          },
        }
      );

      // Перезагружаем тексты после reset (гарантированно выполнится POST запрос)
      await fetchTexts({});
      useToast('Дефолтные тексты восстановлены', undefined, 'success');
      return true;
    } catch (error: any) {
      console.error('Failed to reset defaults:', error);
      useToast(
        'Ошибка восстановления',
        error?.data?.message || 'Не удалось Вернуть тексты по умолчанию',
        'error'
      );
      return false;
    } finally {
      saving.value = false;
    }
  }

  return {
    texts: readonly(texts),
    loading: readonly(loading),
    saving: readonly(saving),
    fetchTexts,
    saveChanges,
    resetDefaults,
  };
}
