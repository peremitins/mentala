import { z } from 'zod';

export const AuthRegisterDto = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  locale: z.string().min(2).max(8).optional(),
  timezone: z.string().optional(),
  // Юридические согласия обязательны для регистрации
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  // Маркетинговое согласие опционально
  marketingConsent: z.boolean().optional(),
});

// Ответ на регистрацию (breaking change)
export const AuthRegisterResponseDto = z.object({
  userId: z.number().int().positive(),
  email: z.string().email(),
  verificationEmailSent: z.boolean().optional(),
  verificationEmailMessage: z.string().optional(),
});

export const AuthRegisterValidationErrorDto = z.object({
  error: z.literal('validation'),
  issues: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    })
  ),
});

export const AuthLoginDto = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  locale: z.string().min(2).max(8).optional(),
  timezone: z.string().optional(),
});

export const EmailVerifyDto = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export const EmailResendCodeDto = z.object({
  email: z.string().email(),
});

export const EmailRequestVerificationDto = z.object({
  email: z.string().email(),
});

export const PasswordSetDto = z.object({
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export const PasswordChangeDto = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export const OAuthLinkVerifyPasswordDto = z.object({
  linkingToken: z.string().min(16),
  password: z.string().min(1),
});

export const OAuthLinkSendCodeDto = z.object({
  linkingToken: z.string().min(16),
});

export const OAuthLinkVerifyCodeDto = z.object({
  linkingToken: z.string().min(16),
  code: z.string().regex(/^\d{6}$/),
});

export const OAuthLinkCancelDto = z.object({
  linkingToken: z.string().min(16),
});

export const GoogleNativeAuthDto = z.object({
  idToken: z.string().min(10),
});

export const AppleNativeAuthDto = z.object({
  identityToken: z.string().min(10),
  // Apple возвращает имя только при первом входе
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const PasswordForgotDto = z.object({
  email: z.string().email(),
});

export const PasswordResetDto = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
});

export type AuthRegisterDto = z.infer<typeof AuthRegisterDto>;
export type AuthRegisterResponseDto = z.infer<typeof AuthRegisterResponseDto>;
export type AuthRegisterValidationErrorDto = z.infer<
  typeof AuthRegisterValidationErrorDto
>;
export type AuthLoginDto = z.infer<typeof AuthLoginDto>;
export type EmailVerifyDto = z.infer<typeof EmailVerifyDto>;
export type EmailResendCodeDto = z.infer<typeof EmailResendCodeDto>;
export type EmailRequestVerificationDto = z.infer<
  typeof EmailRequestVerificationDto
>;
export type PasswordSetDto = z.infer<typeof PasswordSetDto>;
export type PasswordChangeDto = z.infer<typeof PasswordChangeDto>;
export type OAuthLinkVerifyPasswordDto = z.infer<
  typeof OAuthLinkVerifyPasswordDto
>;
export type OAuthLinkSendCodeDto = z.infer<typeof OAuthLinkSendCodeDto>;
export type OAuthLinkVerifyCodeDto = z.infer<typeof OAuthLinkVerifyCodeDto>;
export type OAuthLinkCancelDto = z.infer<typeof OAuthLinkCancelDto>;
export type GoogleNativeAuthDto = z.infer<typeof GoogleNativeAuthDto>;
export type AppleNativeAuthDto = z.infer<typeof AppleNativeAuthDto>;
export type PasswordForgotDto = z.infer<typeof PasswordForgotDto>;
export type PasswordResetDto = z.infer<typeof PasswordResetDto>;
