import nodemailer from 'nodemailer';
import { createError } from 'h3';
import { useRuntimeConfig } from '#imports';
import { maskEmail } from '@/server/application/auth/verification';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  fromName: string;
};

const SMTP_CONNECTION_TIMEOUT_MS = 15_000;
const SMTP_GREETING_TIMEOUT_MS = 10_000;
const SMTP_SOCKET_TIMEOUT_MS = 20_000;
const SMTP_MAX_SEND_ATTEMPTS = 2;
const SMTP_RETRY_DELAY_MS = 800;
const RETRYABLE_SMTP_ERROR_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'EPIPE',
  'ESOCKET',
  'ETIMEDOUT',
]);

function getSmtpConfig(): SmtpConfig {
  const cfg = useRuntimeConfig();
  const host = cfg.smtpHost || process.env.SMTP_HOST;
  const port = Number(cfg.smtpPort || process.env.SMTP_PORT || 465);
  const secure =
    String(cfg.smtpSecure || process.env.SMTP_SECURE || 'true') === 'true';
  const user = cfg.smtpUser || process.env.SMTP_USER;
  const pass = cfg.smtpPassword || process.env.SMTP_PASSWORD;
  const from = cfg.smtpFrom || process.env.SMTP_FROM;
  const fromName = cfg.smtpFromName || process.env.SMTP_FROM_NAME || 'Ментала';

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP config is incomplete');
  }

  return {
    host: String(host),
    port,
    secure,
    user: String(user),
    pass: String(pass),
    from: String(from),
    fromName: String(fromName),
  };
}

export function validateSmtpConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const cfg = useRuntimeConfig();

  if (!cfg.smtpHost && !process.env.SMTP_HOST) {
    errors.push('SMTP_HOST не настроен');
  }
  if (!cfg.smtpUser && !process.env.SMTP_USER) {
    errors.push('SMTP_USER не настроен');
  }
  if (!cfg.smtpPassword && !process.env.SMTP_PASSWORD) {
    errors.push('SMTP_PASSWORD не настроен');
  }
  if (!cfg.smtpFrom && !process.env.SMTP_FROM) {
    errors.push('SMTP_FROM не настроен');
  }

  return { valid: errors.length === 0, errors };
}

function createTransporter(smtp: SmtpConfig): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      servername: smtp.host,
    },
  });
}

function isRetryableSmtpError(error: unknown): boolean {
  const code =
    typeof (error as { code?: unknown })?.code === 'string'
      ? String((error as { code: string }).code).toUpperCase()
      : '';

  return RETRYABLE_SMTP_ERROR_CODES.has(code);
}

async function wait(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html: string;
  successLabel: string;
  errorLabel: string;
};

async function sendEmailWithRetry({
  to,
  subject,
  text,
  html,
  successLabel,
  errorLabel,
}: SendEmailParams): Promise<void> {
  const smtp = getSmtpConfig();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= SMTP_MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      const transporter = createTransporter(smtp);

      await transporter.sendMail({
        from: `${smtp.fromName} <${smtp.from}>`,
        to,
        subject,
        text,
        html,
      });

      console.log(`[Email] ✅ ${successLabel} sent to ${maskEmail(to)}`, {
        attempt,
      });
      return;
    } catch (error: any) {
      lastError = error;

      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || 'UNKNOWN';
      const retryable =
        isRetryableSmtpError(error) && attempt < SMTP_MAX_SEND_ATTEMPTS;

      console.error(
        `[Email] ❌ Failed to send ${errorLabel} to ${maskEmail(to)}:`,
        {
          attempt,
          maxAttempts: SMTP_MAX_SEND_ATTEMPTS,
          error: errorMessage,
          code: errorCode,
          command: error?.command,
          responseCode: error?.responseCode,
          smtpHost: smtp.host,
          smtpPort: smtp.port,
          retryable,
        }
      );

      if (!retryable) {
        break;
      }

      // Короткий backoff помогает пережить transient reset без заметной задержки для пользователя.
      await wait(SMTP_RETRY_DELAY_MS * attempt);
    }
  }

  const errorMessage =
    (lastError as { message?: string } | null)?.message || String(lastError);

  throw createError({
    statusCode: 500,
    statusMessage: 'Email send failed',
    message:
      'Не удалось отправить письмо. Попробуйте позже или обратитесь в поддержку.',
    data:
      process.env.NODE_ENV === 'development'
        ? { originalError: errorMessage }
        : undefined,
  });
}

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  const subject = 'Подтвердите ваш email — Ментала';
  const text = `Ваш код подтверждения: ${code}. Код действителен 15 минут.`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">Подтвердите ваш email</h2>
      <p style="margin: 0 0 16px;">Ваш код подтверждения:</p>
      <div style="display: inline-block; font-size: 24px; letter-spacing: 6px; font-weight: 700; padding: 12px 16px; background: #f1f5f9; border-radius: 12px;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; color: #64748b;">Код действителен 15 минут.</p>
    </div>
  `;

  await sendEmailWithRetry({
    to,
    subject,
    text,
    html,
    successLabel: 'Verification code',
    errorLabel: 'verification code',
  });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const subject = 'Восстановление пароля — Ментала';
  const text = `Перейдите по ссылке для восстановления пароля: ${resetUrl}. Ссылка действительна 1 час.`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">Восстановление пароля</h2>
      <p style="margin: 0 0 16px;">
        Вы запросили восстановление пароля для вашего аккаунта Ментала.
      </p>
      <p style="margin: 0 0 24px;">
        <a
          href="${resetUrl}"
          style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;"
        >
          Восстановить пароль
        </a>
      </p>
      <p style="margin: 16px 0 0; color: #64748b; font-size: 14px;">
        Или скопируйте ссылку в браузер:<br />
        <a href="${resetUrl}" style="color: #3b82f6; word-break: break-all;"
          >${resetUrl}</a
        >
      </p>
      <p style="margin: 16px 0 0; color: #64748b; font-size: 12px;">
        Ссылка действительна 1 час. Если вы не запрашивали восстановление пароля,
        проигнорируйте это письмо.
      </p>
    </div>
  `;

  await sendEmailWithRetry({
    to,
    subject,
    text,
    html,
    successLabel: 'Password reset email',
    errorLabel: 'password reset email',
  });
}
