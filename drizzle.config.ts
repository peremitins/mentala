import 'dotenv/config'

export default {
  schema: './server/infrastructure/db/schema.ts',
  out: './server/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NUXT_PRIVATE_DB_URL!,
  },
} as const
