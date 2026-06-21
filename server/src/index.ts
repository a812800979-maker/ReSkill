import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { sessionRoutes } from './routes/sessions.js';
import { skillRoutes } from './routes/skills.js';
import { executionRoutes } from './routes/executions.js';
import { wsRoutes } from './routes/ws.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = Fastify({ logger: true, bodyLimit: 10_485_760 });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.register(sessionRoutes, { prefix: '/api/sessions' });
  app.register(skillRoutes, { prefix: '/api/skills' });
  app.register(executionRoutes, { prefix: '/api/executions' });
  app.register(wsRoutes);

  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`ReSkill server running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
