import type { FastifyInstance } from 'fastify';
import { streamCommand } from '../lib/run-command.js';
import { parseReviewOutput } from '../lib/parse-review.js';

export async function reviewRoute(app: FastifyInstance) {
  app.post<{
    Body: {
      pr_url: string;
      owner?: string;
      org?: string;
      project?: string;
      repo?: string;
      pr?: string;
      model?: string;
      language?: string;
      json?: boolean;
      postComment?: boolean;
      inline?: boolean;
      skipIfReviewed?: boolean;
      skipFolders?: string;
      incremental?: boolean;
      force?: boolean;
      verbose?: boolean;
      rules?: string;
    };
  }>('/review', async (req, reply) => {
    const {
      pr_url,
      owner,
      org,
      project,
      repo,
      pr,
      model,
      language,
      json,
      postComment,
      inline,
      skipIfReviewed,
      skipFolders,
      incremental,
      force,
      verbose,
      rules,
    } = req.body;

    const args = ['review', pr_url];
    if (owner)         args.push('--owner', owner);
    if (org)           args.push('--org', org);
    if (project)       args.push('--project', project);
    if (repo)          args.push('--repo', repo);
    if (pr)            args.push('--pr', pr);
    if (model)         args.push('--model', model);
    if (language)      args.push('--language', language);
    if (json)          args.push('--json');
    if (postComment)   args.push('--post-comment');
    if (inline)        args.push('--inline');
    if (skipIfReviewed)args.push('--skip-if-reviewed');
    if (skipFolders)args.push('--skip-folders');
    if (incremental)   args.push('--incremental');
    if (force)         args.push('--force');
    if (verbose)       args.push('--verbose');
    if (rules)       args.push('--rules');

    // SSE: o cliente recebe as linhas conforme o CLI as imprime
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });

    const stream = streamCommand(args);

    let fullOutput = '';
    stream.on('data', (chunk: Buffer) => {
      fullOutput += chunk.toString();
    });

    stream.on('end', () => {
      const parsed = parseReviewOutput(fullOutput);
      reply.raw.write(`data: ${JSON.stringify({ result: parsed })}\n\n`);
    });

    await new Promise<void>((res) => {
      stream.on('end', () => {
        reply.raw.end();
        res();
      });
    });
  });
}