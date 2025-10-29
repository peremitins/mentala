import { defineEventHandler, setHeader } from 'h3';
import { getSessionUser } from '@@/server/application/auth/session';
import { exportHistory, readPrivacy } from '../../utils/storage';

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  if (!user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }
  const data = {
    uid: user.id,
    privacy: readPrivacy(String(user.id)),
    history: exportHistory(String(user.id)),
  };
  const json = JSON.stringify(data, null, 2);
  setHeader(event, 'Content-Type', 'application/json');
  setHeader(event, 'Content-Disposition', 'attachment; filename="export.json"');
  return json;
});
