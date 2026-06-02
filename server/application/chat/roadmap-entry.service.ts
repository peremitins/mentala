import type { ChatEntryContext } from '@/shared/dto';

/**
 * Roadmap-шаг как entry-context AI-чата.
 *
 * См. retention/retention_long_term_strategy.md — AI-чат как тип action внутри
 * шага программы. Контекст содержит тему разговора и цель шага, которые
 * сервер инжектит в developer prompt LLM-провайдера, чтобы ассистент:
 *  1) удерживал тему конкретного шага и не уезжал в посторонний разговор,
 *  2) понимал, какую цель пользователь должен достичь к концу разговора,
 *  3) не запускался первым с обычным приветствием — первое сообщение
 *     пишет пользователь.
 */

export function isRoadmapStepEntryContext(
  entryContext?: ChatEntryContext | null
): entryContext is Extract<ChatEntryContext, { type: 'roadmap_step' }> {
  return entryContext?.type === 'roadmap_step';
}

export function buildRoadmapDeveloperPrompt(
  entryContext?: ChatEntryContext | null
): string | null {
  if (!isRoadmapStepEntryContext(entryContext)) {
    return null;
  }

  const lines: string[] = [
    '## Режим Roadmap-шага программы',
    `Пользователь сейчас находится на шаге #${entryContext.step_number} «${entryContext.step_title}» программы «${entryContext.program_slug}».`,
    '',
    'Это не свободный разговор, а структурированный этап практики. Удерживай тему разговора, не уезжай в посторонние темы. Если пользователь сам сменит тему — мягко верни в фокус шага одним предложением.',
    '',
    `**Тема разговора:** ${entryContext.topic_prompt}`,
  ];

  if (entryContext.goal_hint && entryContext.goal_hint.trim().length > 0) {
    lines.push('');
    lines.push(`**Цель разговора:** ${entryContext.goal_hint}`);
    lines.push(
      'Постарайся вопросами привести пользователя к этой цели за 3-5 содержательных сообщений. Когда видишь, что цель достигнута, мягко это подсветь, чтобы он мог завершить разговор.'
    );
  }

  lines.push('');
  lines.push(
    'Первое сообщение в диалоге будет от пользователя — не приветствуй первым, отвечай на его реплику. Без эмоджи и без «как я могу помочь». Сразу по делу, в тоне, который у тебя задан выше.'
  );

  return lines.join('\n');
}
