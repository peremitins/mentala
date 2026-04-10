import { requireRole } from '@/server/utils/require-role';
import {
  AUTO_ACCESS_CODE_PREFIX,
  buildUniqueAccessCode,
} from '@/server/application/promo-codes/access-code.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const code = await buildUniqueAccessCode({
    prefix: AUTO_ACCESS_CODE_PREFIX,
  });

  return {
    code,
  };
});
