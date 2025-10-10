import 'dotenv/config';

export default {
  schema: './server/infrastructure/db/schema.ts',
  out: './server/infrastructure/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'postgresql://USER:PASSWORD@HOST:5432/DATABASE',
  },
} as const;
