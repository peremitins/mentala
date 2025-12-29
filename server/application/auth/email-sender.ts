import nodemailer from 'nodemailer';
import { useRuntimeConfig } from '#imports';

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
  const smtp = getSmtpConfig();
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
