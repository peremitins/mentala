import { z } from 'zod';

export const UpdatePolicyStatusEnum = z.enum(['ok', 'required']);

export const UpdatePolicyResponseDto = z.object({
  status: UpdatePolicyStatusEnum,
  minimumSupportedBuild: z.number().int().nonnegative(),
  storeUrl: z.string(),
  title: z.string(),
  message: z.string(),
});

export const UpdatePolicyAdminPatchDto = z.object({
  platform: z.enum(['ios', 'android']),
  minimumSupportedBuild: z.number().int().nonnegative().optional(),
  storeUrl: z.string().url().optional(),
  blockerTitle: z.string().max(200).optional(),
  blockerMessage: z.string().max(1000).optional(),
});

export type UpdatePolicyStatus = z.infer<typeof UpdatePolicyStatusEnum>;
export type UpdatePolicyResponse = z.infer<typeof UpdatePolicyResponseDto>;
export type UpdatePolicyAdminPatch = z.infer<typeof UpdatePolicyAdminPatchDto>;
