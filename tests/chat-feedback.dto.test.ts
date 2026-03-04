import { describe, expect, it } from 'vitest';
import {
  ChatFeedbackListQueryDto,
  ChatFeedbackUpsertRequestDto,
} from '../shared/dto';

describe('Chat feedback DTO', () => {
  it('валидирует like без topic и comment', () => {
    const parsed = ChatFeedbackUpsertRequestDto.parse({
      therapySessionId: 42,
      assistantMessageClientId: 'assistant-msg-1',
      rating: 1,
    });

    expect(parsed.rating).toBe(1);
    expect(parsed.topicCode).toBeUndefined();
    expect(parsed.comment).toBeUndefined();
  });

  it('валидирует dislike без topicCode', () => {
    const parsed = ChatFeedbackUpsertRequestDto.parse({
      therapySessionId: 42,
      assistantMessageClientId: 'assistant-msg-1',
      rating: -1,
    });

    expect(parsed.rating).toBe(-1);
    expect(parsed.topicCode).toBeUndefined();
  });

  it('запрещает topicCode для like', () => {
    const parsed = ChatFeedbackUpsertRequestDto.safeParse({
      therapySessionId: 42,
      assistantMessageClientId: 'assistant-msg-1',
      rating: 1,
      topicCode: 'OTHER',
    });

    expect(parsed.success).toBe(false);
  });

  it('ограничивает comment длиной 1000 символов', () => {
    const parsed = ChatFeedbackUpsertRequestDto.safeParse({
      therapySessionId: 42,
      assistantMessageClientId: 'assistant-msg-1',
      rating: -1,
      topicCode: 'NOT_HELPFUL',
      comment: 'x'.repeat(1001),
    });

    expect(parsed.success).toBe(false);
  });

  it('ограничивает assistantMessageText длиной 8000 символов', () => {
    const parsed = ChatFeedbackUpsertRequestDto.safeParse({
      therapySessionId: 42,
      assistantMessageClientId: 'assistant-msg-1',
      rating: -1,
      assistantMessageText: 'x'.repeat(8001),
    });

    expect(parsed.success).toBe(false);
  });

  it('приводит therapySessionId в query к числу', () => {
    const parsed = ChatFeedbackListQueryDto.parse({
      therapySessionId: '77',
    });

    expect(parsed.therapySessionId).toBe(77);
  });
});
