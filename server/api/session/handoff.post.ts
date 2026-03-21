import { createError, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  ChatModeHandoffRequestDto,
  ChatModeHandoffResponseDto,
} from '@/shared/dto';
import { performChatModeHandoff } from '@/server/application/chat/chatModeHandoff.service';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = ChatModeHandoffRequestDto.parse((await readBody(event)) || {});
  const response = await performChatModeHandoff({
    userId: sessionUser.id,
    request: body,
  });

  return ChatModeHandoffResponseDto.parse(response);
});
