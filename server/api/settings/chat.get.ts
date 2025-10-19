import { getOrSetAnonUserId } from '@/server/utils/user';
import { readChatSettings } from '@/server/utils/storage';
import { summaryStore } from '@/server/utils/summaryStore';

export default defineEventHandler(async (event) => {
  const uid = getOrSetAnonUserId(event);
  const settings = readChatSettings(uid);
  const count = await summaryStore.countByUser(uid);
  return { settings, isFirstSession: count === 0 };
});
