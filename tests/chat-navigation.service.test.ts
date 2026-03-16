import { describe, expect, it } from 'vitest';
import { buildNavigationSuggestedChips } from '../server/application/navigation/chat-navigation.service';

describe('chat navigation service', () => {
  it('резолвит явный запрос на дыхание 4-7-8 в action chip', async () => {
    const chips = await buildNavigationSuggestedChips({
      messages: [
        {
          role: 'user',
          content: 'Открой дыхание 4-7-8, пожалуйста',
        },
      ],
    });

    expect(chips[0]).toMatchObject({
      kind: 'action',
      action: 'open_breath_practice',
      target: {
        type: 'breath_practice',
        slug: '4-7-8',
        groupKey: 'sleep',
      },
    });
  });

  it('резолвит запрос на дневник благодарности', async () => {
    const chips = await buildNavigationSuggestedChips({
      messages: [
        {
          role: 'user',
          content: 'Хочу открыть дневник благодарности',
        },
      ],
    });

    expect(chips[0]).toMatchObject({
      kind: 'action',
      action: 'open_gratitude_diary',
      target: {
        type: 'gratitude_diary',
      },
    });
  });

  it('добавляет практики из therapy context без явной команды', async () => {
    const chips = await buildNavigationSuggestedChips({
      messages: [
        {
          role: 'assistant',
          content: 'Давай подберём мягкую практику на тревогу.',
        },
      ],
      entryContext: {
        type: 'therapy_topic',
        topic_id: 'anxiety',
      },
    });

    expect(chips).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: {
            type: 'meditation_collection',
            topicKey: 'anxiety',
          },
        }),
        expect.objectContaining({
          target: {
            type: 'breath_practice_group',
            groupKey: 'anxiety',
          },
        }),
      ])
    );
  });
});
