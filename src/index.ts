#!/usr/bin/env node

import { Command } from 'commander';
import { authCommand } from './interfaces/cli/commands/auth.js';
import { reviewCommand } from './interfaces/cli/commands/review.js';
import { configCommand } from './interfaces/cli/commands/config.js';
import { updateCommand } from './interfaces/cli/commands/update.js';
import { modelsCommand } from './interfaces/cli/commands/models.js';
import { webCommand } from './interfaces/cli/commands/web.js';
import { stopProviders } from './providers/provider-registry.js';

// Suppress Node.js experimental feature warnings (e.g. SQLite) in this process
// and in any child processes spawned by the Copilot SDK.
process.env.NODE_NO_WARNINGS = '1';

// Enable verbose logging early so providers receive the flag before any action runs
if (process.argv.includes('--verbose')) {
  process.env.BEREAN_VERBOSE = '1';
}

const program = new Command();

program
  .name('berean')
  .description('🔍 AI-powered code review for GitHub and Azure DevOps PRs using Ollama or GitHub Copilot')
  .version('2.0.0', '-v, --version', 'Show current version');

program.addCommand(authCommand);
program.addCommand(reviewCommand);
program.addCommand(configCommand);
program.addCommand(updateCommand);
program.addCommand(modelsCommand);
program.addCommand(webCommand);

// Cleanup on exit
process.on('beforeExit', async () => {
  await stopProviders();
});

program.parse();
