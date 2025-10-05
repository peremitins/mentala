import * as Sentry from '@sentry/vue'
import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app'

export default defineNuxtPlugin((nuxtApp) => {
  const dsn = (useRuntimeConfig().public as Record<string, string | undefined>).sentryDsn
  if (!dsn || typeof dsn !== 'string') return
  Sentry.init({
    app: nuxtApp.vueApp,
    dsn,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
  })
})
