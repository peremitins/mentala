import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    theme: 'dark' as 'dark' | 'light',
  }),
})
