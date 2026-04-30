import type { FastifyInstance } from 'fastify';
import { runCommand } from '../lib/run-command.js';

export async function authRoute(app: FastifyInstance) {
  app.post('/auth', async (req, reply) => {
    const result = await runCommand(['auth']);
    return reply.status(result.code === 0 ? 200 : 500).send(result);
  });
}