import { Command } from 'commander';
import chalk from 'chalk';
import { 
  isAuthenticated,
  getAuthStatus,
  loginViaCLI,
  logoutViaCLI
} from '../services/copilot-auth.js';
import { clearCredentials, getConfigDir, saveConfig, getDefaultModel } from '../services/credentials.js';
import { fetchModels } from '../providers/github-copilot.js';
import { createInterface } from 'readline';

export const authCommand = new Command('auth')
  .description('Manage GitHub Copilot authentication');

authCommand
  .command('login')
  .description('Authenticate with GitHub Copilot')
  .action(async () => {
    if (isAuthenticated()) {
      const status = await getAuthStatus();
      if (status.method === 'env') {
        console.log(chalk.yellow('⚠️  Already authenticated via environment variable.'));
        console.log(chalk.gray(`  Token: ${status.token}`));
        console.log(chalk.gray('  Env vars checked: COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN'));
        return;
      }
      if (status.method === 'cli') {
        console.log(chalk.yellow('⚠️  Already authenticated via Copilot CLI.'));
        console.log(chalk.gray('  Run "berean auth logout" first to re-authenticate.'));
        return;
      }
    }

    console.log(chalk.blue('🔐 Starting GitHub Copilot authentication...\n'));
    console.log(chalk.gray('This will open the Copilot CLI login flow.\n'));

    try {
      loginViaCLI();
      
      console.log(chalk.green('\n✓ Authentication successful!'));

      // Prompt to select a model
      await promptModelSelection();

    } catch (error) {
      console.log(chalk.red(`\n✗ Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.gray('\nAlternatively, set a GitHub token as environment variable:'));
      console.log(chalk.gray('  export GITHUB_TOKEN="ghp_xxxxx"'));
      console.log(chalk.gray('  export GH_TOKEN="ghp_xxxxx"'));
      console.log(chalk.gray('  export COPILOT_GITHUB_TOKEN="ghp_xxxxx"'));
      process.exit(1);
    }
  });

async function promptModelSelection() {
  console.log(chalk.blue('\n📋 Available AI Models:\n'));

  try {
    const models = await fetchModels();

    const currentModel = getDefaultModel();

    models.forEach((model, index) => {
      const isDefault = model.id === currentModel;
      const marker = isDefault ? chalk.green(' (default)') : '';
      console.log(`  ${chalk.yellow(`${index + 1})`)} ${chalk.cyan(model.id)}${marker}`);
    });

    console.log();

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.white(`Select a default model (1-${models.length}) or press Enter to keep "${currentModel}": `), resolve);
    });

    rl.close();

    const selection = parseInt(answer, 10);

    if (!isNaN(selection) && selection >= 1 && selection <= models.length) {
      const selectedModel = models[selection - 1];
      saveConfig({ default_model: selectedModel.id });
      console.log(chalk.green(`\n✓ Default model set to: ${chalk.cyan(selectedModel.id)}`));
    } else if (answer.trim() === '') {
      console.log(chalk.gray(`\n  Keeping default model: ${currentModel}`));
    } else {
      console.log(chalk.yellow(`\n  Invalid selection. Keeping default model: ${currentModel}`));
    }

    console.log(chalk.gray('\n  You can change this later with: berean models select'));

  } catch (error) {
    console.log(chalk.yellow('\n  Could not fetch models. You can set a model later with: berean models select'));
  }
}

authCommand
  .command('logout')
  .description('Sign out from GitHub Copilot')
  .action(() => {
    logoutViaCLI();
    clearCredentials();
    console.log(chalk.green('✓ Signed out successfully.'));
    console.log(chalk.gray('  Note: Environment variable tokens (GITHUB_TOKEN, etc.) are not affected.'));
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    console.log(chalk.blue('🔍 Checking authentication status...\n'));

    const status = await getAuthStatus();

    if (!status.authenticated) {
      console.log(chalk.yellow('○ Not authenticated'));
      console.log(chalk.gray('\n  Options to authenticate:'));
      console.log(chalk.gray('  1. Run "berean auth login" (uses Copilot CLI)'));
      console.log(chalk.gray('  2. Set environment variable:'));
      console.log(chalk.gray('     export GITHUB_TOKEN="ghp_xxxxx"'));
      console.log(chalk.gray('     export GH_TOKEN="ghp_xxxxx"'));
      console.log(chalk.gray('     export COPILOT_GITHUB_TOKEN="ghp_xxxxx"'));
      return;
    }

    switch (status.method) {
      case 'env':
        console.log(chalk.green('● Authenticated via environment variable'));
        console.log(chalk.gray(`  Token: ${status.token}`));
        break;
      case 'cli':
        console.log(chalk.green('● Authenticated via Copilot CLI'));
        break;
    }

    console.log(chalk.gray('  Ready to review PRs.'));
  });
