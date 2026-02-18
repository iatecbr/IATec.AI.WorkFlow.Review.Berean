import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import { fetchModels, ModelDetail, stopClient } from '../providers/github-copilot.js';
import { isAuthenticated } from '../services/copilot-auth.js';
import { getDefaultModel, getDefaultModelSource, saveConfig } from '../services/credentials.js';

export const modelsCommand = new Command('models')
  .description('List and select AI models');

modelsCommand
  .command('list')
  .description('List available AI models')
  .action(async () => {
    if (!isAuthenticated()) {
      console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
      process.exit(1);
    }

    const spinner = ora('Fetching available models...').start();

    try {
      const models = await fetchModels();
      spinner.succeed('Available models:\n');

      const currentModel = getDefaultModel();

      for (const model of models) {
        const isCurrent = model.id === currentModel;
        const marker = isCurrent ? chalk.green(' ✓ (current)') : '';
        const premium = model.isPremium ? chalk.yellow(' ★') : '';
        console.log(`  ${chalk.cyan(model.id)}${marker}${premium}`);
        if (model.name !== model.id) {
          console.log(chalk.gray(`    ${model.name}`));
        }
        const details: string[] = [];
        if (model.maxContextTokens) {
          details.push(`ctx: ${(model.maxContextTokens / 1000).toFixed(0)}k`);
        }
        if (model.maxOutputTokens) {
          details.push(`out: ${(model.maxOutputTokens / 1000).toFixed(0)}k`);
        }
        if (model.supportsVision) details.push('vision');
        if (model.supportsReasoning && model.reasoningEfforts) {
          details.push(`reasoning: ${model.reasoningEfforts.join('/')}`);
        }
        if (model.multiplier !== undefined && model.multiplier > 0) {
          details.push(`${model.multiplier}x`);
        }
        if (model.policyState && model.policyState !== 'enabled') {
          details.push(chalk.red(model.policyState));
        }
        if (details.length > 0) {
          console.log(chalk.gray(`    ${details.join(' · ')}`));
        }
      }

      console.log();
      console.log(chalk.gray('To set a default model, run: berean models set <model-id>'));
      console.log(chalk.gray('Or set BEREAN_MODEL environment variable'));
      console.log(chalk.gray('Or interactively: berean models select'));
    } catch (error) {
      spinner.fail('Failed to fetch models');
      console.log(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await stopClient();
    }
  });

modelsCommand
  .command('set <model>')
  .description('Set default AI model')
  .action(async (model: string) => {
    if (!isAuthenticated()) {
      console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
      process.exit(1);
    }

    const spinner = ora('Verifying model...').start();

    try {
      const models = await fetchModels();
      const validModel = models.find(m => m.id === model);

      if (!validModel) {
        spinner.fail('Invalid model');
        console.log(chalk.red(`  Model "${model}" not found.`));
        console.log(chalk.gray('  Run "berean models list" to see available models.'));
        process.exit(1);
      }

      saveConfig({ default_model: model });
      spinner.succeed(`Default model set to: ${chalk.cyan(model)}`);
    } catch (error) {
      spinner.fail('Failed to set model');
      console.log(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await stopClient();
    }
  });

modelsCommand
  .command('select')
  .description('Interactively select default AI model')
  .action(async () => {
    if (!isAuthenticated()) {
      console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
      process.exit(1);
    }

    const spinner = ora('Fetching available models...').start();

    try {
      const models = await fetchModels();
      spinner.stop();

      const currentModel = getDefaultModel();

      console.log(chalk.blue('\n📋 Available AI Models:\n'));

      models.forEach((model, index) => {
        const isCurrent = model.id === currentModel;
        const marker = isCurrent ? chalk.green(' (current)') : '';
        const premium = model.isPremium ? chalk.yellow(' ★') : '';
        console.log(`  ${chalk.yellow(`${index + 1})`)} ${chalk.cyan(model.id)}${marker}${premium}`);
        if (model.name !== model.id) {
          console.log(chalk.gray(`      ${model.name}`));
        }
      });

      console.log();

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(chalk.white(`Select a model (1-${models.length}) or press Enter to cancel: `), resolve);
      });

      rl.close();

      const selection = parseInt(answer, 10);

      if (isNaN(selection) || selection < 1 || selection > models.length) {
        console.log(chalk.yellow('\nNo changes made.'));
        return;
      }

      const selectedModel = models[selection - 1];
      saveConfig({ default_model: selectedModel.id });

      console.log(chalk.green(`\n✓ Default model set to: ${chalk.cyan(selectedModel.id)}`));

    } catch (error) {
      spinner.fail('Failed to fetch models');
      console.log(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    } finally {
      await stopClient();
    }
  });

modelsCommand
  .command('current')
  .description('Show current default model')
  .action(() => {
    const currentModel = getDefaultModel();
    const source = getDefaultModelSource();
    console.log(`${chalk.cyan(currentModel)} ${chalk.gray(`(from ${source})`)}`);
  });
