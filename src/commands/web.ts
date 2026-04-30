import { Command } from 'commander';
import chalk from 'chalk';
import Fastify, { FastifyInstance } from 'fastify';
import { reviewRoute } from '../routes/review.js';
import { authRoute } from '../routes/auth.js';
import { printBanner } from '../lib/terminal-printer.js';

export const webCommand = new Command('web')
  .description('Start the Berean web server for handling review requests via HTTP')
  .option('--hostname <hostname>', 'Hostname or IP address to bind (default: 0.0.0.0)')
  .action(async (options) => {
    console.log(chalk.blue('🚀 Starting Berean web server...'));

    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    const host = options.hostname || process.env.HOST || '127.0.0.1';
    const app: FastifyInstance = Fastify({ logger: false });

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
