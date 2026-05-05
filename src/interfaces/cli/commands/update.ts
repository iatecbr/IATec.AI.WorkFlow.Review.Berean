import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const updateCommand = new Command('update')
  .description('Update Berean to the latest version')
  .option('--check', 'Only check for updates, don\'t install')
  .action(async (options) => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(__dirname, '..', '..');

    if (options.check) {
      await checkForUpdates(projectRoot);
      return;
    }

    console.log(chalk.blue('🔄 Updating Berean...\n'));

    const spinner = ora('Fetching latest changes...').start();

    try {
      // Git pull
      execSync('git pull origin main', { 
        cwd: projectRoot, 
        stdio: 'pipe' 
      });
      spinner.succeed('Fetched latest changes');

      // Install dependencies
      const installSpinner = ora('Installing dependencies...').start();
      execSync('npm install', { 
        cwd: projectRoot, 
        stdio: 'pipe' 
      });
      installSpinner.succeed('Dependencies installed');

      // Build
      const buildSpinner = ora('Building...').start();
      execSync('npm run build', { 
        cwd: projectRoot, 
        stdio: 'pipe' 
      });
      buildSpinner.succeed('Build complete');

      console.log(chalk.green('\n✓ Berean updated successfully!'));
      
      // Show current version
      try {
        const pkgPath = path.join(projectRoot, 'package.json');
        const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgContent);
        console.log(chalk.gray(`  Version: ${pkg.version}`));
      } catch {
        // Ignore version display error
      }

    } catch (error) {
      spinner.fail('Update failed');
      
      if (error instanceof Error) {
        console.log(chalk.red(`\n  ${error.message}`));
      }
      
      console.log(chalk.gray('\n  Try manually:'));
      console.log(chalk.gray('    cd ' + projectRoot));
      console.log(chalk.gray('    git pull && npm install && npm run build'));
      
      process.exit(1);
    }
  });

async function checkForUpdates(projectRoot: string) {
  const spinner = ora('Checking for updates...').start();

  try {
    // Fetch without merging
    execSync('git fetch origin main', { 
      cwd: projectRoot, 
      stdio: 'pipe' 
    });

    // Check if behind
    const status = execSync('git rev-list --count HEAD..origin/main', {
      cwd: projectRoot,
      encoding: 'utf-8'
    }).trim();

    const behind = parseInt(status, 10);

    if (behind > 0) {
      spinner.succeed(`Update available! (${behind} new commits)`);
      console.log(chalk.gray('  Run `berean update` to install'));
    } else {
      spinner.succeed('Already up to date!');
    }

  } catch (error) {
    spinner.fail('Failed to check for updates');
    if (error instanceof Error) {
      console.log(chalk.red(`  ${error.message}`));
    }
  }
}
