import type { ChatEntryContext } from '@/shared/dto';

export interface LoggerPort {
  info: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface LlmProviderPort {
  id: 'openai' | 'deepseek' | 'yandex';
  chat: (params: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'developer';
      content: string;
    }>;
    model?: string;
    options?: {
      sessionId?: string;
      temperature?: number;
      maxOutputTokens?: number; // Для Responses API
      scenario?: 'chat' | 'notifications' | 'chips'; // Сценарий использования
      lang?: string;
      user_locale?: string;
      user_name?: string;
      user_gender?: string;
      user_timezone?: string;
      userId?: number | string;
      isFirstSession?: boolean;
      userPrompt?: string;
      entryContext?: ChatEntryContext;
    };
  }) => Promise<{ role: 'assistant'; content: string; model?: string }>;
  // Optional streaming interface: yields text deltas
  chatStream?: (params: {
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'developer';
      content: string;
    }>;
    model?: string;
    options?: {
      sessionId?: string;
      temperature?: number;
      maxOutputTokens?: number; // Для Responses API
      scenario?: 'chat' | 'notifications' | 'chips'; // Сценарий использования
      lang?: string;
      user_locale?: string;
      user_name?: string;
      user_gender?: string;
      user_timezone?: string;
      userId?: number | string;
      isFirstSession?: boolean;
      userPrompt?: string;
      entryContext?: ChatEntryContext;
    };
  }) => AsyncIterable<string>;
  finishSession?: (params: {
    sessionId: string;
    allMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }>;
    userId: string;
    model?: string;
  }) => Promise<void>;
}
