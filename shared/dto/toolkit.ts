import { z } from 'zod';

/**
 * «Мой набор» — персональная подборка пользователя внутри раздела «Практики».
 * Элементы материализуются из roadmap-шагов (личные фразы + запускаемые практики,
 * которые юзер выбрал) и добавляются вручную (фразы). См. shared/toolkit/registry.ts —
 * там описан маппинг опций шага на реальные назначения.
 */

// Назначение запускаемого элемента (practice / ai_chat). Резолвится в роут на фронте
// через resolveToolkitRoute(). Для личных фраз toolRef = null.
export const ToolkitToolRefDto = z.discriminatedUnion('kind', [
  // SOS-практики (заземление / снятие напряжения) — /quick-help?entry=...
  z.object({ kind: z.literal('sos'), entry: z.enum(['panic', 'tension']) }),
  // Дыхательная практика — /breath-practices/<slug>
  z.object({ kind: z.literal('breath'), slug: z.string().min(1).max(80) }),
  // Выгрузка мыслей — /quick-help/thought-dump
  z.object({ kind: z.literal('thought_dump') }),
  // Переход в чат с ассистентом — /chat
  z.object({ kind: z.literal('chat') }),
]);
export type ToolkitToolRef = z.infer<typeof ToolkitToolRefDto>;

// Источник элемента (сад/шаг). У системных практик при дедупе их может быть несколько.
export const ToolkitItemSourceDto = z.object({
  programSlug: z.string(),
  stepId: z.string().optional(),
  gardenTitle: z.string().optional(),
});
export type ToolkitItemSource = z.infer<typeof ToolkitItemSourceDto>;

export const ToolkitItemTypeDto = z.enum(['practice', 'phrase', 'ai_chat']);
export type ToolkitItemType = z.infer<typeof ToolkitItemTypeDto>;

export const ToolkitItemOriginDto = z.enum(['roadmap', 'manual']);
export type ToolkitItemOrigin = z.infer<typeof ToolkitItemOriginDto>;

export const UserToolkitItemDto = z.object({
  id: z.number(),
  type: ToolkitItemTypeDto,
  title: z.string(),
  // Текст личной фразы (type='phrase'); для системных элементов — null.
  content: z.string().nullable(),
  toolRef: ToolkitToolRefDto.nullable(),
  // Канонический ключ дедупа системных элементов; для личных фраз — null.
  itemKey: z.string().nullable(),
  sources: z.array(ToolkitItemSourceDto),
  origin: ToolkitItemOriginDto,
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserToolkitItem = z.infer<typeof UserToolkitItemDto>;

// Ручное добавление личной фразы.
export const CreateToolkitPhraseDto = z.object({
  content: z.string().trim().min(1).max(300),
});
export type CreateToolkitPhrase = z.infer<typeof CreateToolkitPhraseDto>;

// Редактирование текста личной фразы.
export const UpdateToolkitPhraseDto = z.object({
  content: z.string().trim().min(1).max(300),
});
export type UpdateToolkitPhrase = z.infer<typeof UpdateToolkitPhraseDto>;
