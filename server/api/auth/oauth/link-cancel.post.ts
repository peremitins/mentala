import { OAuthLinkCancelDto } from '@/shared/dto/auth';
import { deleteLinkingData, getLinkCodeKey } from '@/server/application/auth/oauth-linking';
import { deleteRedisKey } from '@/server/application/auth/verification';

export default defineEventHandler(async (event) => {
  const body = OAuthLinkCancelDto.parse(await readBody(event as any));
  const linkingToken = body.linkingToken;

  await deleteLinkingData(linkingToken);
  await deleteRedisKey(getLinkCodeKey(linkingToken));

  return { success: true };
});
