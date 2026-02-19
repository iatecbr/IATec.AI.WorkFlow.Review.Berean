import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

export const updateCommand = new Command('update')
  .description('Update Berean to the latest version')
  .option('--check', "Only check for updates, don't install")
  .action(async (options) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(__dirname, '..', '..');

    if (options.check) {
      await checkForUpdates(projectRoot);
      return;
    }

    const isDevInstall = fs.existsSync(path.join(projectRoot, '.git'));

    if (isDevInstall) {
      await updateFromGit(projectRoot);
    } else {
      await updateFromNpm();
    }
  });

async function updateFromNpm() {
  console.log(chalk.blue('🔄 Updating Berean via npm...\n'));
  const spinner = ora('Installing latest version...').start();

  try {
    execSync('npm update -g @iatec/berean', { stdio: 'pipe' });
    spinner.succeed('Berean updated successfully!');

    try {
      const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };
      console.log(chalk.gray(`  Version: ${version}`));
    } catch { /* ignore */ }
  } catch (error) {
    spinner.fail('Update failed');
    if (error instanceof Error) console.log(chalk.red(`\n  ${error.message}`));
    console.log(chalk.gray('\n  Try manually: npm update -g @iatec/berean'));
    process.exit(1);
  }
}

async function updateFromGit(projectRoot: string) {
  console.log(chalk.blue('🔄 Updating Berean from source...\n'));

  const spinner = ora('Fetching latest changes...').start();

  try {
    execSync('git pull origin main', { cwd: projectRoot, stdio: 'pipe' });
    spinner.succeed('Fetched latest changes');

    const installSpinner = ora('Installing dependencies...').start();
    execSync('npm install', { cwd: projectRoot, stdio: 'pipe' });
    installSpinner.succeed('Dependencies installed');

    const buildSpinner = ora('Building...').start();
    execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
    buildSpinner.succeed('Build complete');

    console.log(chalk.green('\n✓ Berean updated successfully!'));

    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      const { version } = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version: string };
      console.log(chalk.gray(`  Version: ${version}`));
    } catch { /* ignore */ }
  } catch (error) {
    spinner.fail('Update failed');
    if (error instanceof Error) console.log(chalk.red(`\n  ${error.message}`));
    console.log(chalk.gray('\n  Try manually:'));
    console.log(chalk.gray('    cd ' + projectRoot));
    console.log(chalk.gray('    git pull && npm install && npm run build'));
    process.exit(1);
  }
}

async function checkForUpdates(projectRoot: string) {
  const isDevInstall = fs.existsSync(path.join(projectRoot, '.git'));

  if (!isDevInstall) {
    const spinner = ora('Checking for updates on npm...').start();
    try {
      const _require = createRequire(import.meta.url);
      const { version: current } = _require('../../package.json') as { version: string };
      const latest = execSync('npm view @iatec/berean version', { encoding: 'utf-8' }).trim();

      if (latest && latest !== current) {
        spinner.succeed(`Update available: ${chalk.gray(current)} → ${chalk.green(latest)}`);
        console.log(chalk.gray('  Run `berean update` to install'));
      } else {
        spinner.succeed(`Already up to date! (${current})`);
      }
    } catch (error) {
      spinner.fail('Failed to check for updates');
      if (error instanceof Error) console.log(chalk.red(`  ${error.message}`));
    }
    return;
  }

  const spinner = ora('Checking for updates...').start();
  try {
    execSync('git fetch origin main', { cwd: projectRoot, stdio: 'pipe' });
    const behind = parseInt(
      execSync('git rev-list --count HEAD..origin/main', { cwd: projectRoot, encoding: 'utf-8' }).trim(),
      10,
    );

    if (behind > 0) {
      spinner.succeed(`Update available! (${behind} new commit${behind > 1 ? 's' : ''})`);
      console.log(chalk.gray('  Run `berean update` to install'));
    } else {
      spinner.succeed('Already up to date!');
    }
  } catch (error) {
    spinner.fail('Failed to check for updates');
    if (error instanceof Error) console.log(chalk.red(`  ${error.message}`));
  }
}
