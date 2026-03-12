import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNuxtApp } from '#app';
import { useToast } from '@/app/composables/useToast';

// Тип одного элемента избранного (соответствует строке в БД)
export interface FavoritePromptItem {
  id: number;
  promptType: 'catalog' | 'custom';
  catalogPromptId: string | null;
  customText: string | null;
  sortOrder: number;
  createdAt: string;
}

export function useGratitudeDiaryFavorites() {
  const { $api } = useNuxtApp();
  const { t } = useI18n();

  const favorites = ref<FavoritePromptItem[]>([]);
  const isLoading = ref(false);

  // Вычисляемый Map для O(1) проверки: является ли каталожный промпт избранным.
  // Ключ: catalogPromptId, значение: FavoritePromptItem.
  const catalogFavoriteMap = computed(
    () =>
      new Map(
        favorites.value
          .filter(
            (f): f is FavoritePromptItem & { catalogPromptId: string } =>
              f.promptType === 'catalog' && f.catalogPromptId !== null
          )
          .map((f) => [f.catalogPromptId, f])
      )
  );

  // Инициализация данными из первоначального GET /prompts
  function setInitialFavorites(items: FavoritePromptItem[]) {
    favorites.value = [...items];
  }

  // Проверить, является ли каталожный промпт избранным (O(1) через Map)
  function isPromptFavorite(catalogPromptId: string): boolean {
    return catalogFavoriteMap.value.has(catalogPromptId);
  }

  // Проверить, является ли промпт кастомным по его display-id (= String(dbId))
  function isCustomFavoriteByDisplayId(displayId: string): boolean {
    return favorites.value.some(
      (f) => f.promptType === 'custom' && String(f.id) === displayId
    );
  }

  // Найти DB-запись кастомного промпта по его display-id (= String(dbId))
  function getCustomFavoriteByDisplayId(
    displayId: string
  ): FavoritePromptItem | undefined {
    return favorites.value.find(
      (f) => f.promptType === 'custom' && String(f.id) === displayId
    );
  }

  // Переключить каталожный промпт в избранном: добавить если нет, убрать если есть
  async function toggleCatalogFavorite(catalogPromptId: string): Promise<void> {
    const existing = catalogFavoriteMap.value.get(catalogPromptId);
    if (existing) {
      await removeFavorite(existing.id);
    } else {
      await addCatalogFavorite(catalogPromptId);
    }
  }

  // Добавить каталожный промпт в избранное с оптимистичным обновлением
  async function addCatalogFavorite(catalogPromptId: string): Promise<void> {
    const snapshot = [...favorites.value];

    // Оптимистично добавляем временный элемент с id = -1
    favorites.value = [
      ...favorites.value,
      {
        id: -1,
        promptType: 'catalog',
        catalogPromptId,
        customText: null,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
      },
    ];

    try {
      const { items } = await $api<{ items: FavoritePromptItem[] }>(
        '/api/gratitude-diary/favorites',
        { method: 'POST', body: { promptType: 'catalog', catalogPromptId } }
      );
      // Заменяем оптимистичные данные реальными от сервера
      favorites.value = items;
    } catch (error: any) {
      // Rollback к предыдущему состоянию
      favorites.value = snapshot;
      useToast(
        t('GRATITUDE_DIARY.FAVORITES_ADD_ERROR'),
        error?.data?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
        'error'
      );
    }
  }

  // Удалить промпт из избранного с оптимистичным обновлением
  async function removeFavorite(favoriteDbId: number): Promise<void> {
    const snapshot = [...favorites.value];

    // Оптимистично убираем из списка
    favorites.value = favorites.value.filter((f) => f.id !== favoriteDbId);

    try {
      await $api<{ removedId: number }>(
        `/api/gratitude-diary/favorites/${favoriteDbId}`,
        { method: 'DELETE' }
      );
    } catch (error: any) {
      // Rollback к предыдущему состоянию
      favorites.value = snapshot;
      useToast(
        t('GRATITUDE_DIARY.FAVORITES_REMOVE_ERROR'),
        error?.data?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
        'error'
      );
    }
  }

  // Создать кастомный промпт с оптимистичным обновлением
  async function createCustomFavorite(text: string): Promise<FavoritePromptItem | null> {
    const snapshot = [...favorites.value];

    // Временный ID для оптимистичного элемента (отрицательный чтобы не пересекался с реальными)
    const tempId = -(Date.now());
    const tempItem: FavoritePromptItem = {
      id: tempId,
      promptType: 'custom',
      catalogPromptId: null,
      customText: text,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
    };

    // Оптимистично добавляем в начало списка
    favorites.value = [tempItem, ...favorites.value];

    try {
      const { items } = await $api<{ items: FavoritePromptItem[] }>(
        '/api/gratitude-diary/favorites',
        { method: 'POST', body: { promptType: 'custom', customText: text } }
      );
      favorites.value = items;
      // Находим только что созданный элемент по тексту и типу
      return items.find((f) => f.promptType === 'custom' && f.customText === text) ?? null;
    } catch (error: any) {
      // Rollback к предыдущему состоянию
      favorites.value = snapshot;

      // Проверяем — если лимит превышен, показываем специфичное сообщение
      const isLimitError = error?.statusCode === 422;
      useToast(
        isLimitError
          ? t('GRATITUDE_DIARY.FAVORITES_LIMIT_REACHED')
          : t('GRATITUDE_DIARY.FAVORITES_CREATE_ERROR'),
        isLimitError ? '' : (error?.data?.message || t('GRATITUDE_DIARY.COMMON_ERROR')),
        'error'
      );
      return null;
    }
  }

  // Редактировать кастомный промпт с оптимистичным обновлением
  async function updateCustomFavorite(
    favoriteDbId: number,
    text: string
  ): Promise<void> {
    const snapshot = [...favorites.value];

    // Оптимистично обновляем текст
    favorites.value = favorites.value.map((f) =>
      f.id === favoriteDbId ? { ...f, customText: text } : f
    );

    try {
      await $api<{ item: FavoritePromptItem }>(
        `/api/gratitude-diary/favorites/${favoriteDbId}`,
        { method: 'PATCH', body: { customText: text } }
      );
    } catch (error: any) {
      // Rollback к предыдущему состоянию
      favorites.value = snapshot;
      useToast(
        t('GRATITUDE_DIARY.FAVORITES_UPDATE_ERROR'),
        error?.data?.message || t('GRATITUDE_DIARY.COMMON_ERROR'),
        'error'
      );
    }
  }

  return {
    favorites,
    isLoading,
    catalogFavoriteMap,
    setInitialFavorites,
    isPromptFavorite,
    isCustomFavoriteByDisplayId,
    getCustomFavoriteByDisplayId,
    toggleCatalogFavorite,
    removeFavorite,
    createCustomFavorite,
    updateCustomFavorite,
  };
}
