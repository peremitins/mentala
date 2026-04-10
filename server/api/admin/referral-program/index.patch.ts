import { requireRole } from '@/server/utils/require-role';
import { AdminReferralProgramUpdateDto } from '@/shared/dto/referral';
import { updateReferralProgramSettings } from '@/server/application/referral/referral-rewards.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');
  const body = AdminReferralProgramUpdateDto.parse(await readBody(event));
  const program = await updateReferralProgramSettings({
    values: body,
  });

  return {
    program,
  };
});
