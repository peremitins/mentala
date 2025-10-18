import { getOrSetAnonUserId } from '@/server/utils/user';
import { readChatSettings } from '@/server/utils/storage';

export default defineEventHandler(async (event) => {
  const uid = getOrSetAnonUserId(event);
  const settings = readChatSettings(uid);
  return { settings };
});
