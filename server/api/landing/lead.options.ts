import { setResponseStatus } from 'h3';
import { setLandingCorsHeaders } from '@/server/utils/landing-cors';

// CORS preflight для устаревшей формы лида: старые закэшированные HTML могут
// слать POST с кросс-доменом, и без preflight браузер заблокирует ответ
// и юзер увидит ошибку. Сам POST отвечает 410 — см. lead.post.ts.
export default defineEventHandler(async (event) => {
  setLandingCorsHeaders(event);
  setResponseStatus(event, 204, 'No Content');
  return null;
});
