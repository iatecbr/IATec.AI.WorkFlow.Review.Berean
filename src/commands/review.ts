import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  parsePRUrl,
  fetchPRDiff,
  postPRComment,
  postInlineComments,
  PRInfo,
  findBereanComments,
  getPRCommits,
  getFilesChangedInCommits,
  shouldIgnorePR,
  addReviewedCommitsTag,
} from '../services/azure-devops.js';
import { reviewCode, fetchModels, stopClient, ReviewResult, ReviewIssue } from '../providers/github-copilot.js';
import { isAuthenticated } from '../services/copilot-auth.js';
import { getAzureDevOpsPATFromPipeline, getDefaultModel, getDefaultLanguage, getRulesPaths } from '../services/credentials.js';
import { loadRules } from '../services/rules.js';

export const reviewCommand = new Command('review')
  .description('Review a Pull Request')
  .argument('[url]', 'Azure DevOps PR URL')
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
  .option(
    '--rules <source>',
    'Rules source: file, directory, or URL with {{query}} placeholder. Repeatable.',
    (val: string, prev: string[]) => [...prev, val],
    [] as string[],
  )
  .action(async (url, options) => {
    try {
    // List models
    if (options.listModels) {
      await listModels();
      return;
    }

    // Check authentication
    if (!isAuthenticated()) {
      console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
      process.exit(1);
    }

    // Check Azure DevOps PAT
    if (!getAzureDevOpsPATFromPipeline()) {
      console.log(chalk.red('✗ Azure DevOps PAT not configured.'));
      console.log(chalk.gray('  Set AZURE_DEVOPS_PAT environment variable or run:'));
      console.log(chalk.gray('  berean config set azure-pat <your-pat>'));
      process.exit(1);
    }

    // Parse PR info
    let prInfo: PRInfo | null = null;
    
    if (url) {
      prInfo = parsePRUrl(url);
      if (!prInfo) {
        console.log(chalk.red('✗ Invalid Azure DevOps PR URL'));
        console.log(chalk.gray('  Expected format: https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}'));
        process.exit(1);
      }
    } else if (options.org && options.project && options.repo && options.pr) {
      prInfo = {
        organization: options.org,
        project: options.project,
        repository: options.repo,
        pullRequestId: parseInt(options.pr, 10)
      };
    } else {
      console.log(chalk.red('✗ Please provide a PR URL or use --org, --project, --repo, --pr flags'));
      process.exit(1);
    }

    // Fetch PR diff first (we need description to check for ignore)
    const diffSpinner = ora('Fetching PR diff...').start();
    
    const diffResult = await fetchPRDiff(prInfo);
    
    if (!diffResult.success || !diffResult.diff) {
      diffSpinner.fail('Failed to fetch PR diff');
      console.log(chalk.red(`  ${diffResult.error}`));
      process.exit(1);
    }

    diffSpinner.succeed(`Fetched PR: ${diffResult.prDetails?.title || 'Unknown'}`);

    // Check for @berean: ignore in PR description
    if (!options.force && shouldIgnorePR(diffResult.prDetails?.description)) {
      console.log(chalk.yellow('⏭️  Skipped: PR description contains @berean: ignore'));
      console.log(chalk.gray('   Use --force to review anyway'));
      process.exit(0);
    }

    // Check for existing Berean reviews and commits
    let existingReview = null;
    let reviewedCommits: string[] = [];
    let allCommits: string[] = [];
    let newCommits: string[] = [];

    if (options.skipIfReviewed || options.incremental) {
      const checkSpinner = ora('Checking for existing reviews...').start();
      
      const [bereanComments, prCommits] = await Promise.all([
        findBereanComments(prInfo),
        getPRCommits(prInfo)
      ]);

      allCommits = prCommits;
      
      if (bereanComments.length > 0) {
        // Aggregate ALL reviewed commits from ALL Berean comments, not just the last one.
        // This ensures subsequent incremental reviews don't re-review already-covered commits.
        reviewedCommits = bereanComments.flatMap(c => c.reviewedCommits || []);
        existingReview = bereanComments[bereanComments.length - 1];

        // Find commits that haven't been reviewed yet
        newCommits = allCommits.filter(c => !reviewedCommits.includes(c));

        if (options.skipIfReviewed && newCommits.length === 0) {
          checkSpinner.succeed('PR already reviewed by Berean (no new commits)');
          console.log(chalk.gray('   Use --force to review again'));
          process.exit(0);
        }

        if (options.incremental && newCommits.length === 0) {
          checkSpinner.succeed('No new commits since last review');
          process.exit(0);
        }

        if (newCommits.length > 0) {
          checkSpinner.succeed(
            `Found ${newCommits.length} new commit(s) since last review (${reviewedCommits.length} already reviewed)`,
          );
        } else {
          checkSpinner.succeed('No previous Berean review found');
        }
      } else {
        checkSpinner.succeed('No previous Berean review found');
        newCommits = allCommits;
      }
    } else {
      // Just get commits for tagging
      allCommits = await getPRCommits(prInfo);
      newCommits = allCommits;
    }

    // Get config for defaults
    const language = options.language || getDefaultLanguage();
    const model = options.model || getDefaultModel();

    // Determine rule sources: CLI flags take precedence over config/env.
    // Each --rules entry may itself be comma-separated (e.g. --rules "path,https://url"),
    // so we flatMap + split to normalize all cases into a clean array of individual sources.
    const rulesSources: string[] = (options.rules as string[]).length > 0
      ? (options.rules as string[]).flatMap(s => s.split(',').map(p => p.trim()).filter(Boolean))
      : getRulesPaths();

    // Load rules with PR context for URL {{query}} substitution
    let rules: string | undefined;
    if (rulesSources.length > 0) {
      const rulesSpinner = ora(`Loading rules from ${rulesSources.length} source(s)...`).start();

      const filePaths = extractFilePathsFromDiff(diffResult.diff!);
      const { content, results } = await loadRules(rulesSources, {
        prTitle: diffResult.prDetails?.title,
        filePaths,
      });

      const ok = results.filter(r => r.ok);
      const failed = results.filter(r => !r.ok);

      if (ok.length > 0) {
        rulesSpinner.succeed(
          `Rules loaded: ${ok.length} source(s)${failed.length > 0 ? `, ${failed.length} failed` : ''}`,
        );
        for (const r of results) {
          if (r.ok) {
            console.log(chalk.gray(`  ✓ ${r.label}`));
          } else {
            console.log(chalk.yellow(`  ⚠ ${r.label}: ${r.error}`));
          }
        }
      } else {
        rulesSpinner.warn('Could not load rules from any source (continuing without rules)');
        for (const r of failed) {
          console.log(chalk.yellow(`  ✗ ${r.label}: ${r.error}`));
        }
      }

      rules = content;
    }

    // For incremental reviews: scope the diff to only files changed in the new commits.
    // This prevents re-reporting issues that were already covered in previous reviews.
    let diffToReview = diffResult.diff!;
    let isIncremental = false;

    if (options.incremental && newCommits.length > 0 && newCommits.length < allCommits.length) {
      const scopeSpinner = ora(`Scoping diff to ${newCommits.length} new commit(s)...`).start();

      const changedFiles = await getFilesChangedInCommits(prInfo, newCommits);

      if (changedFiles.length > 0) {
        const scoped = filterDiffToFiles(diffResult.diff!, new Set(changedFiles));
        // Only use the scoped diff if it contains actual file sections
        if (scoped.includes('## ')) {
          diffToReview = scoped;
          isIncremental = true;
          scopeSpinner.succeed(
            `Scoped to ${changedFiles.length} file(s) changed in new commits`,
          );
        } else {
          scopeSpinner.warn('Could not scope diff — reviewing full PR');
        }
      } else {
        scopeSpinner.warn('No file changes found in new commits — reviewing full PR');
      }
    }

    // Review code
    const reviewSpinner = ora(`Reviewing with ${model}...`).start();

    const reviewResult = await reviewCode(diffToReview, {
      model: model,
      language: language,
      rules: rules
    });

    if (!reviewResult.success) {
      reviewSpinner.fail('Review failed');
      console.log(chalk.red(`  ${reviewResult.error}`));
      process.exit(1);
    }

    reviewSpinner.succeed('Review complete!');

    // Post comment to PR if requested.
    // For incremental reviews: tag only the new commits (already-reviewed ones stay in their own comments).
    if (options.postComment) {
      const commitsToTag = isIncremental ? newCommits : allCommits;
      await postGeneralComment(prInfo, reviewResult, commitsToTag, isIncremental, newCommits.length);
    }

    // Post inline comments if requested
    if (options.inline) {
      await postInlineIssues(prInfo, reviewResult);
    }

    // Output result
    if (options.json) {
      console.log(JSON.stringify(reviewResult, null, 2));
    } else {
      printReviewToTerminal(reviewResult);
    }

    } finally {
      await stopClient();
    }
  });

async function postGeneralComment(
  prInfo: PRInfo,
  reviewResult: ReviewResult,
  commitIds: string[] = [],
  incremental: boolean = false,
  newCommitCount: number = 0,
) {
  const spinner = ora('Posting review comment to PR...').start();

  let comment = formatReviewAsMarkdown(reviewResult, incremental, newCommitCount);

  // Embed commit IDs in the comment so subsequent runs can detect what was reviewed
  if (commitIds.length > 0) {
    comment = addReviewedCommitsTag(comment, commitIds);
  }

  // Always create a new comment thread — incremental reviews are separate entries,
  // not edits of the previous one, so the review history is preserved.
  const result = await postPRComment(prInfo, comment);
  if (result.success) {
    spinner.succeed(incremental ? 'Incremental review posted to PR!' : 'Review posted to PR!');
  } else {
    spinner.fail(`Failed to post comment: ${result.error}`);
  }
}

async function postInlineIssues(prInfo: PRInfo, reviewResult: ReviewResult) {
  const issues = reviewResult.issues || [];
  const inlineIssues = issues.filter(i => i.file && i.line);

  if (inlineIssues.length === 0) {
    console.log(chalk.yellow('  No issues with file/line info for inline comments'));
    return;
  }

  const spinner = ora(`Posting ${inlineIssues.length} inline comments...`).start();

  const comments = inlineIssues.map(issue => ({
    filePath: issue.file!,
    line: issue.line!,
    content: formatIssueAsMarkdown(issue)
  }));

  const result = await postInlineComments(prInfo, comments);

  if (result.failed === 0) {
    spinner.succeed(`Posted ${result.success} inline comments!`);
  } else if (result.success > 0) {
    spinner.warn(`Posted ${result.success} comments, ${result.failed} failed`);
    for (const err of result.errors.slice(0, 3)) {
      console.log(chalk.gray(`    ${err}`));
    }
  } else {
    spinner.fail(`Failed to post inline comments`);
    for (const err of result.errors.slice(0, 3)) {
      console.log(chalk.red(`    ${err}`));
    }
  }
}

function formatReviewAsMarkdown(
  reviewResult: ReviewResult,
  incremental = false,
  newCommitCount = 0,
): string {
  let md = incremental
    ? `## 🔄 Incremental Review — ${newCommitCount} new commit(s)\n\n` +
      `> Only files changed in the latest push are included in this review.\n\n`
    : '## 🔍 AI Code Review\n\n';

  // If we have structured data, use it
  if (reviewResult.summary) {
    md += `### Summary\n${reviewResult.summary}\n\n`;
  }

  if (reviewResult.issues && reviewResult.issues.length > 0) {
    md += '### Issues Found\n\n';
    
    for (const issue of reviewResult.issues) {
      const icon = issue.severity === 'critical' ? '🔴' : 
                   issue.severity === 'warning' ? '🟡' : '🔵';
      
      md += `${icon} **${issue.severity.toUpperCase()}**`;
      if (issue.file) {
        md += ` - \`${issue.file}${issue.line ? `:${issue.line}` : ''}\``;
      }
      md += `\n${issue.message}\n`;
      
      if (issue.suggestion) {
        md += `\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\`\n`;
      }
      md += '\n';
    }
  } else if (!reviewResult.summary && reviewResult.review) {
    // No structured data, use raw review
    md += reviewResult.review + '\n\n';
  } else {
    md += '✅ **No issues found!** Code looks good.\n\n';
  }

  if (reviewResult.positives && reviewResult.positives.length > 0) {
    md += '### ✅ Good Practices\n';
    for (const positive of reviewResult.positives) {
      md += `- ${positive}\n`;
    }
    md += '\n';
  }

  if (reviewResult.recommendations && reviewResult.recommendations.length > 0) {
    md += '### 💡 Recommendations\n';
    for (const rec of reviewResult.recommendations) {
      md += `- ${rec}\n`;
    }
    md += '\n';
  }

  md += '\n---\n*Generated by [Berean](https://github.com/rajada1/berean) 🔍*';

  return md;
}

function formatIssueAsMarkdown(issue: ReviewIssue): string {
  const icon = issue.severity === 'critical' ? '🔴' : 
               issue.severity === 'warning' ? '🟡' : '🔵';
  
  let md = `${icon} **${issue.severity.toUpperCase()}**: ${issue.message}`;
  
  if (issue.suggestion) {
    md += `\n\n\`\`\`suggestion\n${issue.suggestion}\n\`\`\``;
  }

  return md;
}

function printReviewToTerminal(reviewResult: ReviewResult) {
  console.log('\n' + chalk.blue.bold('═'.repeat(60)));
  console.log(chalk.blue.bold(' Code Review Results'));
  console.log(chalk.blue.bold('═'.repeat(60)) + '\n');

  if (reviewResult.summary) {
    console.log(chalk.white.bold('Summary:'));
    console.log(chalk.white(reviewResult.summary) + '\n');
  }

  if (reviewResult.issues && reviewResult.issues.length > 0) {
    console.log(chalk.white.bold('Issues Found:\n'));
    
    for (const issue of reviewResult.issues) {
      let icon, color;
      switch (issue.severity) {
        case 'critical':
          icon = '🔴';
          color = chalk.red;
          break;
        case 'warning':
          icon = '🟡';
          color = chalk.yellow;
          break;
        default:
          icon = '🔵';
          color = chalk.blue;
      }

      console.log(`${icon} ${color.bold(issue.severity.toUpperCase())}`);
      if (issue.file) {
        console.log(chalk.gray(`   ${issue.file}${issue.line ? `:${issue.line}` : ''}`));
      }
      console.log(chalk.white(`   ${issue.message}`));
      
      if (issue.suggestion) {
        console.log(chalk.green(`   Suggestion: ${issue.suggestion}`));
      }
      console.log();
    }
  } else if (reviewResult.review && !reviewResult.summary) {
    // Raw review output (non-JSON response)
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

/**
 * Extract changed file paths from the formatted diff string.
 * Used to build the context for URL-based rules {{query}} substitution.
 */
function extractFilePathsFromDiff(diff: string): string[] {
  const matches = [...diff.matchAll(/^## (?:Add|Edit|Delete|Rename|Change|SourceRename): (.+)$/mg)];
  return matches.map(m => m[1].trim());
}

const FILE_SECTION_RE = /\n## (?:Add|Edit|Delete|Rename|Change|SourceRename): /;

/**
 * Return a copy of the diff containing only the file sections whose path is in `filePaths`.
 * The PR header (title, branch info) is preserved. The file count is updated accordingly.
 */
function filterDiffToFiles(diff: string, filePaths: Set<string>): string {
  if (filePaths.size === 0) return diff;

  // Find where file sections begin
  const firstSection = diff.search(FILE_SECTION_RE);
  if (firstSection === -1) return diff;

  const header = diff.substring(0, firstSection);
  const body = diff.substring(firstSection);

  // Split into individual file sections (each starts with \n## ...)
  const sections = body.split(/(?=\n## (?:Add|Edit|Delete|Rename|Change|SourceRename): )/);

  const kept = sections.filter(section => {
    const match = section.match(/\n## (?:Add|Edit|Delete|Rename|Change|SourceRename): (.+)/);
    return match ? filePaths.has(match[1].trim()) : false;
  });

  // Update the "Files changed: N" counter in the header
  const updatedHeader = header.replace(/Files changed: \d+/, `Files changed: ${kept.length}`);

  return updatedHeader + kept.join('');
}

async function listModels() {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Run: berean auth login'));
    process.exit(1);
  }

  const spinner = ora('Fetching available models...').start();

  try {
    const models = await fetchModels();
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
