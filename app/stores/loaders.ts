import { defineStore } from 'pinia';

export const useLoadersStore = defineStore('loaders', {
  state: () => ({
    // Глобальный PageLoader (для страниц/действий)
    isPageLoading: false,
    // Скелетоны (для списков данных)
    isSkeletonLoading: false,
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
    hideAllLoaders() {
      this.isPageLoading = false;
      this.isSkeletonLoading = false;
    },
  },
});
