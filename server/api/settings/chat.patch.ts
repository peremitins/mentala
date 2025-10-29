import { readBody } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { writeChatSettings } from '@/server/utils/storage';

type Payload = Partial<{
  theme: 'dark' | 'light';
  mode: 'therapy' | 'habits' | 'growth';
  voice: boolean;
  avatar: boolean;
}>;

export default defineEventHandler(async (event) => {
  const sessUser = await getSessionUser(event);
  if (!sessUser?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const uid = Number(sessUser.id);
  const body = await readBody<Payload>(event);
  const next = writeChatSettings(String(uid), body || {});
  return { settings: next };
});
