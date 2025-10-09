import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const form = await readMultipartFormData(event);
  if (!form?.length)
    throw createError({ statusCode: 400, statusMessage: 'No audio' });

  const file = form.find((f) => (f.type || '').startsWith('audio/'));
  if (!file?.data)
    throw createError({ statusCode: 400, statusMessage: 'Invalid audio' });

  const fd = new FormData();
  fd.append(
    'file',
    new Blob([file.data], { type: file.type || 'audio/webm' }) as any,
    file.filename || 'audio.webm'
  );
  fd.append('model', 'whisper-1');

  const res = await $fetch<{ text: string }>(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openaiApiKey}` },
      body: fd as any,
    }
  );

  return res;
});
