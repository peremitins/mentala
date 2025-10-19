import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { estimateCostUSD } from '../../application/llm.service';
import { config } from '../../config';
import { z } from 'zod';
import { ChatRequestDto, ChatResponseDto } from '~/shared/dto';
import { chatViaProvider } from '../../application/llm.service';
import { getOrSetAnonUserId } from '../../utils/user';

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const parsed = ChatRequestDto.parse(body);
    // Force OpenAI for now regardless of body.provider
    const uid = getOrSetAnonUserId(event);
    const result = await chatViaProvider({
      provider: 'openai',
      model: parsed.model,
      messages: parsed.messages,
      options: {
        sessionId: parsed.sessionId,
        lang: (parsed as any)?.lang,
        user_locale: (parsed as any)?.user_locale,
        user_name: (parsed as any)?.user_name,
        userId: uid, // серверный стабильный uid
        isFirstSession: undefined, // рассчитывается в других местах при стриминге
        userPrompt: (parsed as any)?.userPrompt,
      },
    });
    // simple guard: roughly estimate tokens by characters (very rough ~4 chars per token)
    const tokensIn = Math.ceil(
      parsed.messages.reduce((s, m) => s + m.content.length, 0) / 4
    );
    const tokensOut = Math.ceil((result.content || '').length / 4);
    const estimated = estimateCostUSD({
      provider: 'openai',
      model: result.model || config.llm.openai.defaultModel,
      tokensIn,
      tokensOut,
    });
    if (estimated > config.llm.limits.maxRequestUSD) {
      setResponseStatus(event, 402);
      return {
        error: true,
        message: 'Estimated cost too high for single request',
        estimated,
      };
    }
    const response = ChatResponseDto.parse({
      message: { role: 'assistant', content: result.content },
      provider: 'openai',
      model: result.model,
    });
    return response;
  } catch (e: any) {
    const status = e?.status || e?.response?.status || 500;
    setResponseStatus(event, status);
    return {
      error: true,
      message: e?.message || 'Request failed',
      status,
    };
  }
});
