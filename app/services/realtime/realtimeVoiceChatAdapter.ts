type RealtimeVoiceServerEvent = {
  type?: string;
  [key: string]: any;
};

type ChatAdapterSink = {
  createMessage: (params: {
    role: 'user' | 'assistant';
    content?: string;
    therapySessionId: number;
    transient: true;
    source: 'realtime';
    feedbackDisabled: boolean;
    realtimeTurnId: string | null;
  }) => string;
  appendContent: (messageId: string, delta: string) => void;
  replaceContent: (messageId: string, content: string) => void;
  patchMessage: (
    messageId: string,
    patch: {
      feedbackDisabled?: boolean;
      realtimeTurnId?: string | null;
      source?: 'realtime';
      transient?: boolean;
    }
  ) => void;
  removeMessage: (messageId: string) => void;
};

function extractFinalAssistantText(response: any): string {
  const outputItems = Array.isArray(response?.output) ? response.output : [];
  const chunks: string[] = [];

  for (const item of outputItems) {
    if (item?.role !== 'assistant') continue;
    const contentParts = Array.isArray(item?.content) ? item.content : [];

    for (const part of contentParts) {
      const transcript =
        typeof part?.transcript === 'string' ? part.transcript.trim() : '';
      const text = typeof part?.text === 'string' ? part.text.trim() : '';
      const value = transcript || text;
      if (value) {
        chunks.push(value);
      }
    }
  }

  return chunks.join('\n').trim();
}

export class RealtimeVoiceChatAdapter {
  private readonly userMessagesByItemId = new Map<string, string>();
  private readonly userContentByItemId = new Map<string, string>();
  private readonly assistantMessagesByResponseId = new Map<string, string>();
  private readonly assistantContentByResponseId = new Map<string, string>();
  private readonly finalizedAssistantResponses = new Set<string>();

  constructor(
    private readonly sink: ChatAdapterSink,
    private readonly therapySessionId: number
  ) {}

  private ensureUserMessage(itemId: string): string {
    const existing = this.userMessagesByItemId.get(itemId);
    if (existing) {
      return existing;
    }

    const messageId = this.sink.createMessage({
      role: 'user',
      content: '',
      therapySessionId: this.therapySessionId,
      transient: true,
      source: 'realtime',
      feedbackDisabled: true,
      realtimeTurnId: itemId,
    });
    this.userMessagesByItemId.set(itemId, messageId);
    this.userContentByItemId.set(itemId, '');

    return messageId;
  }

  private ensureAssistantMessage(
    responseId: string,
    itemId?: string | null
  ): string {
    const existing = this.assistantMessagesByResponseId.get(responseId);
    if (existing) {
      if (itemId) {
        this.sink.patchMessage(existing, {
          realtimeTurnId: itemId,
        });
      }
      return existing;
    }

    const messageId = this.sink.createMessage({
      role: 'assistant',
      content: '',
      therapySessionId: this.therapySessionId,
      transient: true,
      source: 'realtime',
      feedbackDisabled: false,
      realtimeTurnId: itemId || responseId,
    });
    this.assistantMessagesByResponseId.set(responseId, messageId);
    this.assistantContentByResponseId.set(responseId, '');

    return messageId;
  }

  private appendUserContent(itemId: string, delta: string) {
    const messageId = this.ensureUserMessage(itemId);
    const nextContent = `${this.userContentByItemId.get(itemId) || ''}${delta}`;
    this.userContentByItemId.set(itemId, nextContent);
    this.sink.appendContent(messageId, delta);
  }

  private replaceUserContent(itemId: string, content: string) {
    const messageId = this.ensureUserMessage(itemId);
    this.userContentByItemId.set(itemId, content);
    this.sink.replaceContent(messageId, content);
  }

  private appendAssistantContent(
    responseId: string,
    itemId: string | null | undefined,
    delta: string
  ) {
    const messageId = this.ensureAssistantMessage(responseId, itemId);
    const nextContent = `${this.assistantContentByResponseId.get(responseId) || ''}${delta}`;
    this.assistantContentByResponseId.set(responseId, nextContent);
    this.sink.appendContent(messageId, delta);
  }

  private replaceAssistantContent(
    responseId: string,
    itemId: string | null | undefined,
    content: string
  ) {
    const messageId = this.ensureAssistantMessage(responseId, itemId);
    this.assistantContentByResponseId.set(responseId, content);
    this.sink.replaceContent(messageId, content);
  }

  finalizeAssistantResponse(responseId: string, finalText?: string | null) {
    const messageId = this.assistantMessagesByResponseId.get(responseId);
    if (!messageId) {
      return;
    }

    if (typeof finalText === 'string' && finalText.trim().length > 0) {
      const normalizedFinalText = finalText.trim();
      this.assistantContentByResponseId.set(responseId, normalizedFinalText);
      this.sink.replaceContent(messageId, normalizedFinalText);
    }

    const trackedContent =
      this.assistantContentByResponseId.get(responseId)?.trim() || '';
    if (!trackedContent) {
      this.sink.removeMessage(messageId);
      this.assistantMessagesByResponseId.delete(responseId);
      this.assistantContentByResponseId.delete(responseId);
    }

    this.finalizedAssistantResponses.add(responseId);
  }

  removeUserMessage(itemId: string) {
    const messageId = this.userMessagesByItemId.get(itemId);
    if (!messageId) {
      return;
    }

    this.sink.removeMessage(messageId);
    this.userMessagesByItemId.delete(itemId);
    this.userContentByItemId.delete(itemId);
  }

  pruneEmptyMessages() {
    for (const [itemId, messageId] of this.userMessagesByItemId.entries()) {
      const content = this.userContentByItemId.get(itemId)?.trim() || '';
      if (content) {
        continue;
      }

      this.sink.removeMessage(messageId);
      this.userMessagesByItemId.delete(itemId);
      this.userContentByItemId.delete(itemId);
    }

    for (const [
      responseId,
      messageId,
    ] of this.assistantMessagesByResponseId.entries()) {
      const content =
        this.assistantContentByResponseId.get(responseId)?.trim() || '';
      if (content) {
        continue;
      }

      this.sink.removeMessage(messageId);
      this.assistantMessagesByResponseId.delete(responseId);
      this.assistantContentByResponseId.delete(responseId);
      this.finalizedAssistantResponses.delete(responseId);
    }
  }

  hasAssistantMessage(responseId: string): boolean {
    return this.assistantMessagesByResponseId.has(responseId);
  }

  handleServerEvent(event: RealtimeVoiceServerEvent) {
    if (typeof event.type !== 'string') {
      return;
    }

    switch (event.type) {
      case 'conversation.item.created': {
        const itemId = String(event.item?.id || '');
        const role = String(event.item?.role || '');
        if (!itemId || role !== 'user') return;

        this.ensureUserMessage(itemId);
        return;
      }

      case 'input_audio_buffer.speech_started': {
        const itemId = String(event.item_id || '');
        if (!itemId) return;

        // Резервируем user bubble в момент старта речи, чтобы assistant reply
        // гарантированно вставлялся ниже, даже если transcription.completed
        // придёт позже output_item.added.
        this.ensureUserMessage(itemId);
        return;
      }

      case 'conversation.item.input_audio_transcription.delta': {
        const itemId = String(event.item_id || '');
        const delta = typeof event.delta === 'string' ? event.delta : '';
        if (!itemId || !delta) return;

        this.appendUserContent(itemId, delta);
        return;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const itemId = String(event.item_id || '');
        const transcript =
          typeof event.transcript === 'string' ? event.transcript.trim() : '';
        if (!itemId) return;

        if (transcript) {
          this.replaceUserContent(itemId, transcript);
          return;
        }

        if (!(this.userContentByItemId.get(itemId)?.trim() || '')) {
          this.removeUserMessage(itemId);
        }
        return;
      }

      case 'conversation.item.input_audio_transcription.failed': {
        const itemId = String(event.item_id || '');
        if (!itemId) return;

        this.removeUserMessage(itemId);
        return;
      }

      case 'response.output_item.added': {
        // Пустой assistant bubble на этом событии не создаём.
        // Ждём первый реальный transcript/text chunk, иначе bubble часто
        // появляется раньше user turn и визуально "прыгает" вверх.
        return;
      }

      case 'response.audio_transcript.delta': {
        const responseId = String(event.response_id || '');
        const itemId = String(event.item_id || '');
        const delta = typeof event.delta === 'string' ? event.delta : '';
        if (!responseId || !delta) return;
        if (this.finalizedAssistantResponses.has(responseId)) {
          return;
        }

        this.appendAssistantContent(responseId, itemId, delta);
        return;
      }

      case 'response.audio_transcript.done': {
        const responseId = String(event.response_id || '');
        if (!responseId) return;

        this.finalizeAssistantResponse(responseId, event.transcript);
        return;
      }

      case 'response.done': {
        const responseId = String(event.response?.id || '');
        if (!responseId || this.finalizedAssistantResponses.has(responseId)) {
          return;
        }

        if (!this.hasAssistantMessage(responseId)) {
          const fallbackText = extractFinalAssistantText(event.response);
          if (!fallbackText) {
            return;
          }
          this.ensureAssistantMessage(responseId, responseId);
        }

        this.finalizeAssistantResponse(
          responseId,
          extractFinalAssistantText(event.response)
        );
        return;
      }

      default:
        return;
    }
  }
}
