import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendOpenAiResponsesRequest } = vi.hoisted(() => ({
  sendOpenAiResponsesRequest: vi.fn(),
}));

vi.mock('@/server/config', () => ({
  config: {
    llm: {
      openai: {
        defaultModel: 'gpt-5-mini',
      },
    },
  },
}));

vi.mock('@/server/config/chatMemory', () => ({
  CHAT_HANDOFF_SUMMARY_SCHEMA_VERSION: 1,
  CHAT_RUNTIME_COMPACT_SCHEMA_VERSION: 1,
}));

vi.mock('@/server/infrastructure/llm/relayClient', () => ({
  isRelayEnabled: () => true,
}));

vi.mock('@/server/infrastructure/llm/openaiResponsesClient', () => ({
  sendOpenAiResponsesRequest,
  extractResponsesText: (response: { output_text?: string }) =>
    response.output_text || '',
  parseStrictJsonResponse: (raw: string) => JSON.parse(raw),
}));

import { generateSessionEndMemoryBundle } from '../server/application/chat/chatSummary.service';

describe('generateSessionEndMemoryBundle request', () => {
  beforeEach(() => {
    sendOpenAiResponsesRequest.mockReset();
  });

  it('отправляет весь transcript сессии одним сериализованным блоком и включает strict schema', async () => {
    sendOpenAiResponsesRequest.mockResolvedValue({
      output_text: JSON.stringify({
        handoff: {
          schemaVersion: 1,
          sessionOverviewShort: 'Пользователь назвал имя и предпочтения',
          themesActive: ['знакомство и самоописание'],
          patternsOrTriggers: [],
          helpfulInterventions: [],
          unfinishedThreads: [],
          riskState: 'none',
          nextSessionGuidance: [],
        },
        profile: {
          schemaVersion: 1,
          name: 'Николай',
          facts: ['любимый цвет: белый'],
          preferences: ['любит ежиков'],
          context: [],
        },
      }),
    });

    await generateSessionEndMemoryBundle({
      transcriptMessages: [
        {
          id: 1,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 1,
          role: 'user',
          content: 'Меня зовут Николай',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
        {
          id: 2,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 2,
          role: 'assistant',
          content: 'Приятно познакомиться',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:10.000Z'),
        },
        {
          id: 3,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 3,
          role: 'user',
          content: 'Люблю ежиков и белый цвет',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:20.000Z'),
        },
      ],
    });

    const requestBody = sendOpenAiResponsesRequest.mock.calls[0]?.[0]?.body;
    const transcriptBlock = requestBody.input.find(
      (item: { role: string; content: Array<{ text: string }> }) =>
        item.role === 'user' &&
        item.content?.[0]?.text?.includes('<session_transcript>')
    );

    expect(requestBody.text.format).toMatchObject({
      type: 'json_schema',
      name: 'session_end_memory_bundle',
      strict: true,
    });
    expect(transcriptBlock.content[0].text).toContain('Меня зовут Николай');
    expect(transcriptBlock.content[0].text).toContain(
      'Люблю ежиков и белый цвет'
    );
    expect(transcriptBlock.content[0].text).toContain('Приятно познакомиться');
  });

  it('передаёт previous durable memory в finish_session уже в budgeted prompt-виде', async () => {
    sendOpenAiResponsesRequest.mockResolvedValue({
      output_text: JSON.stringify({
        handoff: {
          schemaVersion: 1,
          sessionOverviewShort: '',
          themesActive: [],
          patternsOrTriggers: [],
          helpfulInterventions: [],
          unfinishedThreads: [],
          riskState: 'none',
          nextSessionGuidance: [],
        },
        profile: {
          schemaVersion: 1,
          name: '',
          facts: [],
          preferences: [],
          context: [],
        },
      }),
    });

    const noisyValue = '"'.repeat(120);

    await generateSessionEndMemoryBundle({
      previousDurableUserMemory: {
        schemaVersion: 1,
        name: `Николай ${noisyValue}`,
        facts: Array.from(
          { length: 8 },
          (_, index) => `fact ${index + 1} ${noisyValue}`
        ),
        preferences: Array.from(
          { length: 8 },
          (_, index) => `preference ${index + 1} ${noisyValue}`
        ),
        context: Array.from(
          { length: 8 },
          (_, index) => `context ${index + 1} ${noisyValue}`
        ),
      },
      transcriptMessages: [
        {
          id: 1,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 1,
          role: 'user',
          content: 'Меня зовут Николай',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
      ],
    });

    const requestBody = sendOpenAiResponsesRequest.mock.calls[0]?.[0]?.body;
    const systemPromptItem = requestBody.input.find(
      (item: { role: string; content: Array<{ text: string }> }) =>
        item.role === 'system'
    );
    const developerPromptItem = requestBody.input.find(
      (item: { role: string; content: Array<{ text: string }> }) =>
        item.role === 'developer' &&
        item.content?.[0]?.text?.includes('Память пользователя:\n')
    );
    const developerPromptText = developerPromptItem.content[0].text;
    const memoryBlock = developerPromptText.slice(
      developerPromptText.indexOf('Память пользователя:\n')
    );
    const profileProperties =
      requestBody.text.format.schema.properties.profile.properties;

    expect(systemPromptItem.content[0].text).toContain(
      'profile должен быть компактным: facts до 3'
    );
    expect(systemPromptItem.content[0].text).toContain(
      'сервер не будет сам делать add/replace/delete за тебя'
    );
    expect(systemPromptItem.content[0].text).toContain(
      'не клади в handoff имя, facts, favorites, preferences или long-term context пользователя'
    );
    expect(memoryBlock.length).toBeLessThanOrEqual(1000);
    expect(
      requestBody.text.format.schema.properties.handoff.properties
    ).not.toHaveProperty('stableFactsToCarry');
    expect(profileProperties.facts.maxItems).toBe(3);
    expect(profileProperties.preferences.maxItems).toBe(3);
    expect(profileProperties.context.maxItems).toBe(2);
  });

  it('для realtime voice не тащит ранние assistant turns до последнего runtime compaction в session-end prompt', async () => {
    sendOpenAiResponsesRequest.mockResolvedValue({
      output_text: JSON.stringify({
        handoff: {
          schemaVersion: 1,
          sessionOverviewShort: '',
          themesActive: [],
          patternsOrTriggers: [],
          helpfulInterventions: [],
          unfinishedThreads: [],
          riskState: 'none',
          nextSessionGuidance: [],
        },
        profile: {
          schemaVersion: 1,
          name: 'Николай',
          facts: ['любимый цвет: белый'],
          preferences: [],
          context: [],
        },
      }),
    });

    await generateSessionEndMemoryBundle({
      sessionSourceMode: 'realtime_voice',
      runtimeCompactCursorMessageId: 3,
      transcriptMessages: [
        {
          id: 1,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 1,
          role: 'user',
          content: 'Меня зовут Николай',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:00.000Z'),
        },
        {
          id: 2,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 2,
          role: 'assistant',
          content: 'Старый ответ ассистента до compaction',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:10.000Z'),
        },
        {
          id: 3,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 3,
          role: 'user',
          content: 'Я люблю белый цвет',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:20.000Z'),
        },
        {
          id: 4,
          therapySessionId: 42,
          userId: 83,
          turnIndex: 4,
          role: 'assistant',
          content: 'Свежий ответ ассистента после compaction',
          tokenCount: null,
          createdAt: new Date('2026-03-20T10:00:30.000Z'),
        },
      ],
    });

    const requestBody = sendOpenAiResponsesRequest.mock.calls[0]?.[0]?.body;
    const transcriptBlock = requestBody.input.find(
      (item: { role: string; content: Array<{ text: string }> }) =>
        item.role === 'user' &&
        item.content?.[0]?.text?.includes('<session_transcript>')
    );
    const transcriptText = transcriptBlock.content[0].text;

    expect(transcriptText).toContain('Меня зовут Николай');
    expect(transcriptText).toContain('Я люблю белый цвет');
    expect(transcriptText).toContain(
      'Свежий ответ ассистента после compaction'
    );
    expect(transcriptText).not.toContain(
      'Старый ответ ассистента до compaction'
    );
  });
});
