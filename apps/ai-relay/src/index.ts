import { config } from './config.js';
import { buildServer } from './server.js';

const app = buildServer();

async function startServer() {
  try {
    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ address }, 'ai-relay started');
  } catch (err) {
    // Явно логируем ошибку старта, чтобы причина не терялась в логах.
    app.log.error({ err }, 'ai-relay failed to start');
    process.exit(1);
  }
}

void startServer();
