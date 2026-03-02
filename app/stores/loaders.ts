import { defineStore } from 'pinia';

export const useLoadersStore = defineStore('loaders', {
  state: () => ({
    // Глобальный PageLoader (для страниц/действий)
    isPageLoading: false,
    // Скелетоны (для списков данных)
    isSkeletonLoading: false,
    // Лоадер кнопок для локальных async-действий (например, confirm в модалках)
    isButtonLoading: false,
  }),
  actions: {
    showLoader() {
      this.isPageLoading = true;
    },
    hideLoader() {
      this.isPageLoading = false;
    },
    showSkeleton() {
      this.isSkeletonLoading = true;
    },
    hideSkeleton() {
      this.isSkeletonLoading = false;
    },
    showButtonLoader() {
      this.isButtonLoading = true;
    },
    hideButtonLoader() {
      this.isButtonLoading = false;
    },
    hideAllLoaders() {
      this.isPageLoading = false;
      this.isSkeletonLoading = false;
      this.isButtonLoading = false;
    },
  },
});
