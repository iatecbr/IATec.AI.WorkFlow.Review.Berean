import { Command } from 'commander';
import chalk from 'chalk';
import {
  saveConfig,
  getConfig,
  getConfigDir,
  getAzureDevOpsPATFromPipeline,
  getGitHubTokenFromAzure,
  getDefaultModel,
  getDefaultLanguage,
  getDefaultModelSource,
  getDefaultLanguageSource,
  getRulesPaths,
} from '../services/credentials.js';

export const configCommand = new Command('config')
  .description('Manage configuration');

configCommand
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key: string, value: string) => {
    const validKeys = ['azure-pat', 'default-model', 'language', 'rules-path'];

    if (!validKeys.includes(key)) {
      console.log(chalk.red(`✗ Unknown config key: ${key}`));
      console.log(chalk.gray(`  Valid keys: ${validKeys.join(', ')}`));
      console.log(chalk.gray('  Tip: rules-path accepts comma-separated sources'));
      console.log(chalk.gray('  Example: berean config set rules-path "./docs,https://example.com/kb?q={{query}}"'));
      process.exit(1);
    }

    switch (key) {
      case 'azure-pat':
        saveConfig({ azure_devops_pat: value });
        console.log(chalk.green('✓ Azure DevOps PAT saved.'));
        break;
      case 'default-model':
        saveConfig({ default_model: value });
        console.log(chalk.green(`✓ Default model set to: ${value}`));
        break;
      case 'language':
        saveConfig({ language: value });
        console.log(chalk.green(`✓ Language set to: ${value}`));
        break;
      case 'rules-path': {
        saveConfig({ rules_path: value });
        const sources = value.split(',').map(s => s.trim()).filter(Boolean);
        console.log(chalk.green(`✓ Rules path(s) saved (${sources.length} source${sources.length > 1 ? 's' : ''}):`));
        sources.forEach((s, i) => console.log(chalk.gray(`  ${i + 1}. ${s}`)));
        break;
      }
    }
  });

configCommand
  .command('get [key]')
  .description('Get configuration value(s)')
  .action((key?: string) => {
    const config = getConfig();

    if (key) {
      switch (key) {
        case 'azure-pat': {
          const pat = getAzureDevOpsPATFromPipeline();
          if (pat) {
            const masked = pat.substring(0, 6) + '...' + pat.slice(-4);
            console.log(chalk.white(`azure-pat: ${masked}`));
          } else {
            console.log(chalk.gray('azure-pat: (not set)'));
          }
          break;
        }
        case 'default-model':
          console.log(chalk.white(`default-model: ${getDefaultModel()}`));
          console.log(chalk.gray(`  (from ${getDefaultModelSource()})`));
          break;
        case 'language':
          console.log(chalk.white(`language: ${getDefaultLanguage()}`));
          console.log(chalk.gray(`  (from ${getDefaultLanguageSource()})`));
          break;
        case 'rules-path': {
          const paths = getRulesPaths();
          if (paths.length > 0) {
            console.log(chalk.white(`rules-path (${paths.length} source${paths.length > 1 ? 's' : ''}):`));
            paths.forEach((p, i) => console.log(chalk.cyan(`  ${i + 1}. ${p}`)));
          } else {
            console.log(chalk.gray('rules-path: (not set)'));
          }
          break;
        }
        default:
          console.log(chalk.red(`✗ Unknown config key: ${key}`));
          console.log(chalk.gray('  Valid keys: azure-pat, default-model, language, rules-path'));
      }
    } else {
      // Show all config
      console.log(chalk.blue.bold('Configuration:\n'));

      console.log(chalk.white('  Config directory:'), chalk.gray(getConfigDir()));
      console.log();

      const hasPat = !!getAzureDevOpsPATFromPipeline();
      const hasToken = !!getGitHubTokenFromAzure();

      console.log(chalk.white('  azure-pat:'), hasPat
        ? chalk.green('configured')
        : chalk.yellow('not set'));

      console.log(chalk.white('  github-auth:'), hasToken
        ? chalk.green('via environment variable')
        : chalk.yellow('using Copilot CLI'));

      console.log();
      console.log(chalk.white('  default-model:'), chalk.cyan(getDefaultModel()));
      console.log(chalk.gray(`                  (from ${getDefaultModelSource()})`));
      console.log(chalk.white('  language:'), chalk.cyan(getDefaultLanguage()));
      console.log(chalk.gray(`             (from ${getDefaultLanguageSource()})`));

      console.log();
      const rulesPaths = getRulesPaths();
      if (rulesPaths.length > 0) {
        console.log(chalk.white(`  rules-path (${rulesPaths.length} source${rulesPaths.length > 1 ? 's' : ''}):`));
        rulesPaths.forEach((p, i) => console.log(chalk.cyan(`    ${i + 1}. ${p}`)));
      } else {
        console.log(chalk.white('  rules-path:'), chalk.gray('not set'));
      }

      // Suppress unused variable warning
      void config;
    }
  });

configCommand
  .command('path')
  .description('Show config directory path')
  .action(() => {
    console.log(getConfigDir());
  });
