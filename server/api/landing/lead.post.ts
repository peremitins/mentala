import { setResponseStatus } from 'h3';
import { setLandingCorsHeaders } from '@/server/utils/landing-cors';

// Форма waitlist выпилена с лендинга. Эндпоинт оставлен в режиме 410 Gone,
// чтобы старые статические HTML-страницы (закэшированные у юзеров/CDN) и боты,
// бьющие напрямую, получали корректный ответ и не плодили шум в логах/уведомлениях.
// Никаких записей в БД, отправки email/Telegram больше не происходит.
export default defineEventHandler(async (event) => {
  setLandingCorsHeaders(event);
  setResponseStatus(event, 410, 'Gone');
  return {
    message: 'Форма раннего доступа закрыта: приложение уже доступно.',
  };
});
