export interface LoggerPort {
  info: (msg: string, meta?: unknown) => void
  error: (msg: string, meta?: unknown) => void
}

export interface LlmProviderPort {
  id: 'openai' | 'deepseek' | 'yandex'
  chat: (params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    model?: string
  }) => Promise<{ role: 'assistant'; content: string; model?: string }>
}
