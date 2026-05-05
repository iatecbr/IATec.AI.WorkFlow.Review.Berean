import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { listAvailableModels, checkAuth, runReview } from '../../../composition/container.js';
import { printReviewToTerminal } from '../terminal-review.presenter.js';

function log(msg: string): void {
  if (process.env.BEREAN_VERBOSE) {
    console.error(msg);
  }
}

export const reviewCommand = new Command('review')
  .description('Review a Pull Request')
  .argument('[url]', 'Pull Request URL (GitHub or Azure DevOps)')
  .option('--owner <owner>', 'GitHub repository owner')
  .option('--org <organization>', 'Azure DevOps organization')
  .option('--project <project>', 'Azure DevOps project')
  .option('--repo <repository>', 'Repository name')
  .option('--pr <id>', 'Pull Request ID')
  .option('--model <model>', 'AI model to use (default: gpt-4o)')
  .option('--language <lang>', 'Response language (default: English)')
  .option('--json', 'Output as JSON')
  .option('--list-models', 'List available models')
  .option('--post-comment', 'Post review as a comment on the PR')
  .option('--inline', 'Post inline comments on specific lines')
  .option('--skip-if-reviewed', 'Skip if PR was already reviewed by Berean')
  .option('--incremental', 'Only review new commits since last Berean review')
  .option('--force', 'Force review even if @berean: ignore is set')
  .option('--confidence-threshold <number>', 'Minimum confidence to report issues (0-100, default: 75)')
  .option(
    '--rules <sources>',
    'Comma-separated rule sources: file paths, directories, or URLs. ' +
    'URLs with {{query}} are queried dynamically by the LLM. ' +
    'E.g.: ./rules.md,https://host/doc?q={{query}} (or set BEREAN_RULES env)',
  )
  .option(
    '--skip-folders <folders>',
    'Comma-separated list of folders to exclude from review (e.g. node_modules,dist,src/generated)',
  )
  .option('--verbose', 'Show detailed debug output (sets BEREAN_VERBOSE=1)')
  .action(async (url, options) => {
    if (options.listModels) {
      await listModels();
      return;
    }

    if (!checkAuth()) {
      console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
      process.exit(1);
    }

    const spinner = ora('Starting review...').start();
    const result = await runReview({
      url,
      ...options,
      onProgress: ({ message }) => {
        spinner.text = message;
      },
    });

    if (result.status === 'failed') {
      spinner.fail('Review failed');
      console.log(chalk.red(`  ${result.error}`));
      process.exit(1);
    }

    if (result.status === 'skipped') {
      spinner.stop();
      console.log(chalk.yellow(`⏭️  Skipped: ${result.reason}`));
      return;
    }

    spinner.succeed('Review complete!');

    if (options.json) {
      console.log(JSON.stringify(result.reviewResult, null, 2));
    } else {
      printReviewToTerminal(result.reviewResult);
    }

    if (result.postFailed) {
      process.exitCode = 1;
    }
  });

async function listModels() {
  if (!checkAuth()) {
    console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
    process.exit(1);
  }

  const spinner = ora('Fetching available models...').start();

  try {
    const models = await listAvailableModels();
    spinner.succeed('Available models:\n');

    for (const model of models) {
      const defaultBadge = model.isDefault ? chalk.green(' (default)') : '';
      console.log(`  ${chalk.cyan(model.id)}${defaultBadge}`);
      if (model.name !== model.id) {
        console.log(chalk.gray(`    ${model.name}`));
      }
    }
  } catch (error) {
    spinner.fail('Failed to fetch models');
    console.log(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}
