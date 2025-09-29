import pino from 'pino'

declare module 'h3' {
  interface H3EventContext {
    logger: pino.Logger
  }
}

export default defineNitroPlugin((nitroApp) => {
  const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
  nitroApp.hooks.hook('request', (event) => {
    event.context.logger = logger.child({ requestId: getHeader(event, 'x-request-id') })
  })
})
