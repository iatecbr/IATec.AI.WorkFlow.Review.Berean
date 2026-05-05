import chalk from 'chalk';
import type { ReviewIssue, ReviewResult } from '../../application/ports/review-model.port.js';

export function printReviewToTerminal(reviewResult: ReviewResult): void {
  console.log('\n' + chalk.blue.bold('═'.repeat(60)));
  console.log(chalk.blue.bold(' Code Review Results'));
  console.log(chalk.blue.bold('═'.repeat(60)) + '\n');

  if (reviewResult.summary) {
    console.log(chalk.white.bold('Summary:'));
    console.log(chalk.white(reviewResult.summary) + '\n');
  }

  if (reviewResult.recommendation) {
    const recColors: Record<string, (text: string) => string> = {
      APPROVE: chalk.green,
      APPROVE_WITH_SUGGESTIONS: chalk.green,
      NEEDS_CHANGES: chalk.yellow,
      NEEDS_DISCUSSION: chalk.cyan,
    };
    const recEmoji: Record<string, string> = {
      APPROVE: '✅',
      APPROVE_WITH_SUGGESTIONS: '✅💡',
      NEEDS_CHANGES: '⚠️',
      NEEDS_DISCUSSION: '💬',
    };
    const colorFn = recColors[reviewResult.recommendation] ?? chalk.white;
    const emoji = recEmoji[reviewResult.recommendation] ?? '📋';
    console.log(colorFn(`${emoji} Recommendation: ${reviewResult.recommendation.replace(/_/g, ' ')}\n`));
  }

  if (reviewResult.issues && reviewResult.issues.length > 0) {
    console.log(chalk.white.bold('Issues Found:\n'));

    const byFile = new Map<string, ReviewIssue[]>();
    const general: ReviewIssue[] = [];
    for (const issue of reviewResult.issues) {
      if (issue.file) {
        if (!byFile.has(issue.file)) byFile.set(issue.file, []);
        byFile.get(issue.file)!.push(issue);
      } else {
        general.push(issue);
      }
    }

    const printIssue = (issue: ReviewIssue) => {
      const [icon, color] =
        issue.severity === 'critical'
          ? ['🔴', chalk.red]
          : issue.severity === 'warning'
          ? ['🟡', chalk.yellow]
          : ['🔵', chalk.blue];

      let header = `${icon} ${color.bold(issue.severity.toUpperCase())}`;
      if (issue.category) header += chalk.gray(` [${issue.category}]`);
      if (issue.confidence) header += chalk.gray(` (${issue.confidence}%)`);
      console.log(header);
      if (issue.file) console.log(chalk.gray(`   ${issue.file}${issue.line ? `:${issue.line}` : ''}`));
      if (issue.title) console.log(chalk.white.bold(`   ${issue.title}`));
      console.log(chalk.white(`   ${issue.message}`));
      if (issue.suggestion) console.log(chalk.green(`   Suggestion: ${issue.suggestion}`));
      console.log();
    };

    for (const [file, fileIssues] of byFile) {
      console.log(chalk.cyan.bold(`  ${file}`));
      fileIssues.forEach(printIssue);
    }
    general.forEach(printIssue);
  } else if (reviewResult.review && !reviewResult.summary) {
    console.log(reviewResult.review);
  } else {
    console.log(chalk.green('✓ No issues found! Code looks good.'));
  }

  if (reviewResult.positives && reviewResult.positives.length > 0) {
    console.log(chalk.white.bold('Good Practices:\n'));
    for (const positive of reviewResult.positives) {
      console.log(chalk.green(`  ✓ ${positive}`));
    }
    console.log();
  }

  if (reviewResult.recommendations && reviewResult.recommendations.length > 0) {
    console.log(chalk.white.bold('Recommendations:\n'));
    for (const rec of reviewResult.recommendations) {
      console.log(chalk.cyan(`  💡 ${rec}`));
    }
    console.log();
  }

  console.log(chalk.blue.bold('═'.repeat(60)));
}
