// Simple in-memory storage per user (dev). Replace with Postgres/Redis later.
type Privacy = { saveHistory: boolean; retentionDays: number };
type ChatSettings = {
  theme: 'dark' | 'light';
  mode: 'therapy' | 'habits';
  voice: boolean;
  avatar: boolean;
};
const privacyByUser = new Map<string, Privacy>();
const chatSettingsByUser = new Map<string, ChatSettings>();
const historyByUser = new Map<
  string,
  Array<{ role: 'user' | 'assistant'; content: string; ts: number }>
>();

export function readPrivacy(uid: string): Privacy {
  return privacyByUser.get(uid) || { saveHistory: false, retentionDays: 0 };
}
export function writePrivacy(uid: string, patch: Partial<Privacy>) {
  const prev = readPrivacy(uid);
  const next = { ...prev, ...patch };
  privacyByUser.set(uid, next);
  return next;
}

export function readChatSettings(uid: string): ChatSettings {
  return (
    chatSettingsByUser.get(uid) || {
      theme: 'dark',
      mode: 'therapy',
      voice: true,
      avatar: true,
    }
  );
}
export function writeChatSettings(uid: string, patch: Partial<ChatSettings>) {
  const prev = readChatSettings(uid);
  const next = { ...prev, ...patch };
  chatSettingsByUser.set(uid, next);
  return next;
}

export function appendHistory(
  uid: string,
  role: 'user' | 'assistant',
  content: string
) {
  const arr = historyByUser.get(uid) || [];
  arr.push({ role, content, ts: Date.now() });
  historyByUser.set(uid, arr);
}
export function clearHistory(uid: string) {
  historyByUser.delete(uid);
}
export function exportHistory(uid: string) {
  return historyByUser.get(uid) || [];
}
export function deleteAll(uid: string) {
  privacyByUser.delete(uid);
  historyByUser.delete(uid);
  chatSettingsByUser.delete(uid);
}
