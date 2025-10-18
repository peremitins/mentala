import { defineEventHandler, readBody, setHeader } from 'h3';
import { chatStreamViaProvider } from '@@/server/application/llm.service';

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    model?: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    sessionId?: string;
    temperature?: number;
    lang?: string;
    user_locale?: string;
    user_name?: string;
  }>(event);

  // Отдаём как SSE
  setHeader(event, 'Content-Type', 'text/event-stream');
  setHeader(event, 'Cache-Control', 'no-cache');
  setHeader(event, 'Connection', 'keep-alive');

  const res = event.node.res;

  try {
    const stream = chatStreamViaProvider({
      provider: 'openai',
      model: body?.model,
      messages: body?.messages || [],
      options: {
        sessionId: body?.sessionId,
        temperature: body?.temperature,
        lang: body?.lang,
        user_locale: body?.user_locale,
        user_name: body?.user_name,
      },
    });

    for await (const delta of stream) {
      res.write(`data: ${JSON.stringify({ output_text_delta: delta })}\n\n`);
    }
  } catch (e: any) {
    try {
      res.write(
        `data: ${JSON.stringify({ error: true, message: e?.message || 'Stream failed' })}\n\n`
      );
    } catch {}
  } finally {
    try {
      res.write('data: [DONE]\n\n');
    } catch {}
    res.end();
  }
});
