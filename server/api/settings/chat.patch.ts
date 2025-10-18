import { readBody } from 'h3';
import { getOrSetAnonUserId } from '@/server/utils/user';
import { writeChatSettings } from '@/server/utils/storage';

type Payload = Partial<{
  theme: 'dark' | 'light';
  mode: 'therapy' | 'habits' | 'balance';
  voice: boolean;
  avatar: boolean;
}>;

export default defineEventHandler(async (event) => {
  const uid = getOrSetAnonUserId(event);
  const body = await readBody<Payload>(event);
  const next = writeChatSettings(uid, body || {});
  return { settings: next };
});
