import nodemailer from 'nodemailer';
import { useRuntimeConfig } from '#imports';
import type { LandingGoalKey } from '@/shared/dto/landing';

type LeadNotificationPayload = {
  name: string;
  email: string;
  goalKeys?: LandingGoalKey[];
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  yclid?: string;
  fbclid?: string;
  ttclid?: string;
  createdAt: Date;
};

const GOAL_LABELS: Record<LandingGoalKey, string> = {
  reduce_anxiety: 'Снизить тревожность',
  sleep_better: 'Улучшить сон',
  reduce_stress: 'Снизить стресс/выгорание',
  quit_smoking: 'Бросить курить',
  reduce_alcohol: 'Сократить алкоголь',
  reduce_caffeine: 'Сократить кофеин',
  build_habits: 'Развить полезные привычки',
  try_ai_support: 'Попробовать ИИ-поддержку',
  other: 'Другое',
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Moscow',
  }).format(value);
}

function formatGoals(goalKeys?: LandingGoalKey[]): string {
  if (!goalKeys?.length) {
    return 'Не выбраны';
  }
  return goalKeys
    .map((key) => `${GOAL_LABELS[key] || key} (${key})`)
    .join(', ');
}

function getSmtpConfig() {
  const config = useRuntimeConfig();
  const host = config.smtpHost || process.env.SMTP_HOST;
  const port = Number(config.smtpPort || process.env.SMTP_PORT || 465);
  const secure =
    String(config.smtpSecure || process.env.SMTP_SECURE || 'true') === 'true';
  const user = config.smtpUser || process.env.SMTP_USER;
  const pass = config.smtpPassword || process.env.SMTP_PASSWORD;
  const from = config.smtpFrom || process.env.SMTP_FROM;
  const fromName =
    config.smtpFromName || process.env.SMTP_FROM_NAME || 'Mentala';

  if (!host || !user || !pass || !from) {
    return null;
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

export async function sendLandingLeadTeamEmail(
  payload: LeadNotificationPayload
): Promise<void> {
  const smtp = getSmtpConfig();
  if (!smtp) {
    return;
  }

  const config = useRuntimeConfig();
  const to =
    config.landingLeadsEmailTo ||
    process.env.NUXT_LANDING_LEADS_EMAIL_TO ||
    smtp.from;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  const goalText = formatGoals(payload.goalKeys);
  const utmText = [
    payload.utmSource,
    payload.utmMedium,
    payload.utmCampaign,
    payload.utmContent,
    payload.utmTerm,
  ]
    .filter(Boolean)
    .join(' / ');
  const clickIdText = [
    payload.gclid && `gclid=${payload.gclid}`,
    payload.yclid && `yclid=${payload.yclid}`,
    payload.fbclid && `fbclid=${payload.fbclid}`,
    payload.ttclid && `ttclid=${payload.ttclid}`,
  ]
    .filter(Boolean)
    .join(' / ');

  await transporter.sendMail({
    from: `${smtp.fromName} <${smtp.from}>`,
    to,
    subject: 'Новая заявка Mentala (landing)',
    text: [
      'Новая заявка с лендинга Mentala',
      `Имя: ${payload.name}`,
      `Email: ${payload.email}`,
      `Цели: ${goalText}`,
      `UTM: ${utmText || '—'}`,
      `Click ID: ${clickIdText || '—'}`,
      `Дата: ${formatDate(payload.createdAt)}`,
    ].join('\n'),
  });
}

export async function sendLandingLeadTelegram(
  payload: LeadNotificationPayload
): Promise<void> {
  const config = useRuntimeConfig();
  const token =
    config.TELEGRAM_BOT_TOKEN || process.env.NUXT_TELEGRAM_BOT_TOKEN;
  const chatId =
    config.telegramLeadsChatId || process.env.NUXT_TELEGRAM_LEADS_CHAT_ID;

  if (!token || !chatId) {
    return;
  }

  const goalText = formatGoals(payload.goalKeys);
  const utmText = [
    payload.utmSource,
    payload.utmMedium,
    payload.utmCampaign,
    payload.utmContent,
    payload.utmTerm,
  ]
    .filter(Boolean)
    .join(' / ');
  const clickIdText = [
    payload.gclid && `gclid=${payload.gclid}`,
    payload.yclid && `yclid=${payload.yclid}`,
    payload.fbclid && `fbclid=${payload.fbclid}`,
    payload.ttclid && `ttclid=${payload.ttclid}`,
  ]
    .filter(Boolean)
    .join(' / ');

  const message = [
    'Новая заявка Mentala',
    `Имя: ${payload.name}`,
    `Email: ${payload.email}`,
    `Цели: ${goalText}`,
    `UTM: ${utmText || '—'}`,
    `Click ID: ${clickIdText || '—'}`,
    `Дата: ${formatDate(payload.createdAt)}`,
  ].join('\n');

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[Landing] Telegram sendMessage failed: ${response.status} ${errorText}`
    );
  }
}
