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

let cachedTransporter: nodemailer.Transporter | null = null;

function getSmtpConfig(): SmtpConfig {
  const cfg = useRuntimeConfig();
  const host = cfg.smtpHost || process.env.SMTP_HOST;
  const port = Number(cfg.smtpPort || process.env.SMTP_PORT || 465);
  const secure =
    String(cfg.smtpSecure || process.env.SMTP_SECURE || 'true') === 'true';
  const user = cfg.smtpUser || process.env.SMTP_USER;
  const pass = cfg.smtpPassword || process.env.SMTP_PASSWORD;
  const from = cfg.smtpFrom || process.env.SMTP_FROM;
  const fromName = cfg.smtpFromName || process.env.SMTP_FROM_NAME || 'Mentala';

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

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  const smtp = getSmtpConfig();
  cachedTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });
  return cachedTransporter;
}

export async function sendVerificationEmail(
  to: string,
  code: string
): Promise<void> {
  let smtp: SmtpConfig | null = null;

  try {
    smtp = getSmtpConfig();
    const transporter = getTransporter();

    const subject = 'Подтвердите ваш email — Mentala';
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

    await transporter.sendMail({
      from: `${smtp.fromName} <${smtp.from}>`,
      to,
      subject,
      text,
      html,
    });

    // Логируем успешную отправку для мониторинга (без PII)
    console.log(`[Email] ✅ Verification code sent to ${maskEmail(to)}`);
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'UNKNOWN';

    console.error(
      `[Email] ❌ Failed to send verification code to ${maskEmail(to)}:`,
      {
        error: errorMessage,
        code: errorCode,
        smtpHost: smtp?.host,
        smtpPort: smtp?.port,
      }
    );

    throw createError({
      statusCode: 500,
      statusMessage:
        'Не удалось отправить письмо. Попробуйте позже или обратитесь в поддержку.',
      data:
        process.env.NODE_ENV === 'development'
          ? { originalError: errorMessage }
          : undefined,
    });
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<void> {
  const smtp = getSmtpConfig();
  const transporter = getTransporter();

  const subject = 'Восстановление пароля — Mentala';
  const text = `Перейдите по ссылке для восстановления пароля: ${resetUrl}. Ссылка действительна 1 час.`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">Восстановление пароля</h2>
      <p style="margin: 0 0 16px;">
        Вы запросили восстановление пароля для вашего аккаунта Mentala.
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

  await transporter.sendMail({
    from: `${smtp.fromName} <${smtp.from}>`,
    to,
    subject,
    text,
    html,
  });
}

/**
 * Отправка напоминания о ближайшем списании после trial.
 */
export async function sendBillingReminderEmail(params: {
  to: string;
  planName: string;
  chargeAt: Date;
}): Promise<void> {
  const smtp = getSmtpConfig();
  const transporter = getTransporter();
  const localizedChargeAt = params.chargeAt.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const subject = 'Напоминание о списании — Mentala';
  const text = `Напоминаем: ${localizedChargeAt} будет выполнено списание за тариф ${params.planName}. До этой даты вы можете отменить автосписание в настройках подписки.`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin: 0 0 12px;">Напоминание о списании</h2>
      <p style="margin: 0 0 12px;">
        Списание за тариф <strong>${params.planName}</strong> запланировано на
        <strong>${localizedChargeAt}</strong>.
      </p>
      <p style="margin: 0; color: #64748b;">
        Вы можете отменить будущий платеж в настройках подписки до этой даты.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `${smtp.fromName} <${smtp.from}>`,
    to: params.to,
    subject,
    text,
    html,
  });
}
