#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'module';
import { authCommand } from './commands/auth.js';
import { reviewCommand } from './commands/review.js';
import { configCommand } from './commands/config.js';
import { updateCommand } from './commands/update.js';
import { modelsCommand } from './commands/models.js';
import { stopClient } from './providers/github-copilot.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

program
  .name('berean')
  .description('🔍 AI-powered code review for Azure DevOps PRs using GitHub Copilot')
  .version(version, '-v, --version', 'Show current version');

program.addCommand(authCommand);
program.addCommand(reviewCommand);
program.addCommand(configCommand);
program.addCommand(updateCommand);
program.addCommand(modelsCommand);

// Cleanup on exit
process.on('beforeExit', async () => {
  await stopClient();
});

program.parse();
