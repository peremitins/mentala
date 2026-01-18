import { z } from 'zod';

export const MeditationTopicKeyEnum = z.enum(['sleep', 'anxiety', 'stress']);

export const MeditationTopicDto = z.object({
  key: MeditationTopicKeyEnum,
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().optional(),
});

export const MeditationTrackDto = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  topicKey: MeditationTopicKeyEnum,
  topicKeys: z.array(MeditationTopicKeyEnum).optional().nullable(),
  audioPath: z.string().min(1),
  coverPath: z.string().optional().nullable(),
  backgroundPath: z.string().optional().nullable(),
  isLoop: z.boolean().default(false),
  durationSeconds: z.number().int().positive().optional().nullable(),
  isFavorite: z.boolean().optional(),
});

export const MeditationTracksDto = z.array(MeditationTrackDto);

export const MeditationTopicsDto = z.array(MeditationTopicDto);

export const MeditationFavoriteRequestDto = z.object({
  trackId: z.string().min(1),
});

export const MeditationFavoriteDto = z.object({
  trackId: z.string().min(1),
});

export type MeditationTopicKey = z.infer<typeof MeditationTopicKeyEnum>;
export type MeditationTopicDto = z.infer<typeof MeditationTopicDto>;
export type MeditationTrackDto = z.infer<typeof MeditationTrackDto>;
export type MeditationTracksDto = z.infer<typeof MeditationTracksDto>;
export type MeditationTopicsDto = z.infer<typeof MeditationTopicsDto>;
export type MeditationFavoriteRequestDto = z.infer<
  typeof MeditationFavoriteRequestDto
>;
export type MeditationFavoriteDto = z.infer<typeof MeditationFavoriteDto>;
