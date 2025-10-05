import { VueQueryPlugin, QueryClient, hydrate, dehydrate } from '@tanstack/vue-query'
import { defineNuxtPlugin } from 'nuxt/app'

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient()
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })

  if (typeof window === 'undefined') {
    nuxtApp.hooks.hook('app:rendered', () => {
      const nuxtPayload: any = nuxtApp.payload
      nuxtPayload.state.vueQuery = dehydrate(queryClient)
    })
  }
  if (typeof window !== 'undefined') {
    const nuxtPayload: any = nuxtApp.payload
    if (nuxtPayload.state && nuxtPayload.state.vueQuery) {
      hydrate(queryClient, nuxtPayload.state.vueQuery)
    }
  }
})
