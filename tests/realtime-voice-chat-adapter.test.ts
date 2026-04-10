import { describe, expect, it } from 'vitest';
import { RealtimeVoiceChatAdapter } from '../app/services/realtime/realtimeVoiceChatAdapter';

type RuntimeMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  realtimeTurnId: string | null;
  feedbackDisabled?: boolean;
};

function createAdapterHarness() {
  const messages: RuntimeMessage[] = [];

  const adapter = new RealtimeVoiceChatAdapter(
    {
      createMessage: (params) => {
        const messageId = `msg_${messages.length + 1}`;
        messages.push({
          id: messageId,
          role: params.role,
          content: params.content || '',
          realtimeTurnId: params.realtimeTurnId,
          feedbackDisabled: params.feedbackDisabled,
        });
        return messageId;
      },
      appendContent: (messageId, delta) => {
        const message = messages.find((item) => item.id === messageId);
        if (message) {
          message.content += delta;
        }
      },
      replaceContent: (messageId, content) => {
        const message = messages.find((item) => item.id === messageId);
        if (message) {
          message.content = content;
        }
      },
      patchMessage: (messageId, patch) => {
        const message = messages.find((item) => item.id === messageId);
        if (message && typeof patch.realtimeTurnId !== 'undefined') {
          message.realtimeTurnId = patch.realtimeTurnId;
        }
      },
      removeMessage: (messageId) => {
        const index = messages.findIndex((item) => item.id === messageId);
        if (index >= 0) {
          messages.splice(index, 1);
        }
      },
    },
    101
  );

  return {
    adapter,
    messages,
  };
}

describe('realtime voice chat adapter', () => {
  it('создаёт ровно один assistant bubble на один response_id', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'response.output_item.added',
      response_id: 'resp_1',
      item: { id: 'item_1', role: 'assistant' },
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_1',
      item_id: 'item_1',
      delta: 'Привет',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_1',
      item_id: 'item_1',
      delta: ', как ты?',
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: 'assistant',
      content: 'Привет, как ты?',
      realtimeTurnId: 'item_1',
      feedbackDisabled: false,
    });
  });

  it('не создаёт пустой assistant bubble на response.output_item.added без текста', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'response.output_item.added',
      response_id: 'resp_empty',
      item: { id: 'item_empty', role: 'assistant' },
    });

    expect(messages).toHaveLength(0);
  });

  it('финальный transcript заменяет interim-черновик и блокирует дальнейшие delta', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_2',
      item_id: 'item_2',
      delta: 'Чернов',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.done',
      response_id: 'resp_2',
      item_id: 'item_2',
      transcript: 'Черновик готов',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_2',
      item_id: 'item_2',
      delta: ' и это нельзя дописать',
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('Черновик готов');
  });

  it('удаляет user bubble при transcription.failed', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'user_1',
      delta: 'тест',
    });

    expect(messages).toHaveLength(1);

    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'user_1',
    });

    expect(messages).toHaveLength(0);
  });

  it('удаляет пустой user bubble, если финальный transcript пустой', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_2',
      transcript: '',
    });

    expect(messages).toHaveLength(0);
  });

  it('удаляет пустой assistant bubble, если response завершился без текста', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'response.output_item.added',
      response_id: 'resp_3',
      item: { id: 'item_3', role: 'assistant' },
    });
    adapter.handleServerEvent({
      type: 'response.done',
      response: {
        id: 'resp_3',
        output: [],
      },
    });

    expect(messages).toHaveLength(0);
  });

  it('создаёт user bubble раньше assistant, даже если transcript приходит позже', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'conversation.item.created',
      item: { id: 'user_3', role: 'user' },
    });
    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_3',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_4',
      item_id: 'item_4',
      delta: 'Ответ',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_3',
      transcript: 'Мой вопрос',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_4',
      item_id: 'item_4',
      delta: ' ассистента',
    });

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(messages.map((message) => message.content)).toEqual([
      'Мой вопрос',
      'Ответ ассистента',
    ]);
    expect(messages[1]?.feedbackDisabled).toBe(false);
  });

  it('сохраняет порядок user -> assistant даже при повторных speech_started до финальной транскрипции', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'conversation.item.created',
      item: { id: 'user_5', role: 'user' },
    });
    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_5',
    });
    adapter.handleServerEvent({
      type: 'response.audio_transcript.delta',
      response_id: 'resp_5',
      item_id: 'item_5',
      delta: 'Первый ответ',
    });
    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_5',
    });
    adapter.handleServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'user_5',
      transcript: 'Мой вопрос после шума',
    });

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(messages.map((message) => message.content)).toEqual([
      'Мой вопрос после шума',
      'Первый ответ',
    ]);
  });

  it('очищает незавершённые пустые realtime bubbles при cleanup', () => {
    const { adapter, messages } = createAdapterHarness();

    adapter.handleServerEvent({
      type: 'input_audio_buffer.speech_started',
      item_id: 'user_4',
    });

    expect(messages).toHaveLength(1);

    adapter.pruneEmptyMessages();

    expect(messages).toHaveLength(0);
  });
});
