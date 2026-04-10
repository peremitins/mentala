import { assertRedisConfig } from '@/server/config/redis';

export default defineNitroPlugin(() => {
  assertRedisConfig();
});
