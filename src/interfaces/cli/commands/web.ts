import { Command } from 'commander';
import chalk from 'chalk';
import Fastify, { FastifyInstance } from 'fastify';
import { reviewRoute } from '../../http/routes/review.js';
import { authRoute } from '../../http/routes/auth.js';
import { printBanner } from '../server-banner.presenter.js';
import { getServerHost, getServerPort } from '../../../services/credentials.js';

export const webCommand = new Command('web')
  .description('Start the Berean web server for handling review requests via HTTP')
  .option('--hostname <hostname>', 'Hostname or IP address to bind (default: 0.0.0.0)')
  .action(async (options) => {
    console.log(chalk.blue('🚀 Starting Berean web server...'));

    const port = options.port ?? getServerPort();
    const host = options.hostname ?? getServerHost();
    const app: FastifyInstance = Fastify({ logger: false });

    app.setErrorHandler((error, req, reply) => {
      const fastifyError = error as Error & { code?: string; statusCode?: number };

      if (reply.sent || reply.raw.headersSent) {
        return;
      }

      if (fastifyError.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
        return reply.status(400).send({
          error: 'Invalid JSON body.',
          message: 'The request uses Content-Type: application/json, but the body is not valid JSON.',
          hint: 'Send a raw JSON object in the request body.',
          example: {
            pr_url: 'https://github.com/owner/repo/pull/123',
          },
        });
      }

      if (fastifyError.code === 'FST_ERR_VALIDATION') {
        return reply.status(400).send({
          error: 'Invalid request body.',
          message: fastifyError.message,
          hint: 'Only pr_url is required. All other fields are optional and will use defaults from environment/config when available.',
          example: {
            pr_url: 'https://github.com/owner/repo/pull/123',
          },
        });
      }

      req.log.error(error);
      return reply.status(fastifyError.statusCode ?? 500).send({
        error: 'Internal server error.',
        message: fastifyError.message,
      });
    });

    app.register(reviewRoute);
    app.register(authRoute);

    // Graceful shutdown handler
    const shutdown = async (signal: string) => {
      console.log(chalk.yellow(`\n⚠️  Received ${signal}. Shutting down web server...`));
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        console.error(chalk.red('❌ Error during shutdown:'), err);
        process.exit(1);
      }
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    try {
      await app.listen({ port, host });
        printBanner(port);
    //  console.log(chalk.green(`🚀 Berean web server running on http://${host}:${port}`));
      process.stdin.resume(); // Mantém o processo vivo
    } catch (error) {
      console.error(chalk.red('❌ Failed to start web server:'), error);
      process.exit(1);
    }
  });
