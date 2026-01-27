import * as Sentry from '@sentry/node'

export default defineNitroPlugin(() => {
  const dsn = process.env.NUXT_PUBLIC_SENTRY_DSN
  if (!dsn) return
  Sentry.init({ dsn, tracesSampleRate: 0.1 })
})
