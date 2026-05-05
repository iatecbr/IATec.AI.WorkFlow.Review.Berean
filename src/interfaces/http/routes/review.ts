import type { FastifyInstance } from 'fastify';
import { runReview } from '../../../composition/container.js';
import { SseReviewPresenter } from '../presenters/sse-review.presenter.js';

export interface ReviewRequestBody {
  pr_url: string;
  owner?: string;
  org?: string;
  project?: string;
  repo?: string;
  pr?: string;
  model?: string;
  language?: string;
  postComment?: boolean;
  inline?: boolean;
  skipIfReviewed?: boolean;
  skipFolders?: string;
  incremental?: boolean;
  force?: boolean;
  verbose?: boolean;
  rules?: string;
}

export async function reviewRoute(app: FastifyInstance) {
  app.post<{ Body: ReviewRequestBody }>('/review', {
    schema: {
      body: {
        type: 'object',
        required: ['pr_url'],
        properties: {
          pr_url: { type: 'string', minLength: 1 },
          owner: { type: 'string' },
          org: { type: 'string' },
          project: { type: 'string' },
          repo: { type: 'string' },
          pr: { type: 'string' },
          model: { type: 'string' },
          language: { type: 'string' },
          postComment: { type: 'boolean' },
          inline: { type: 'boolean' },
          skipIfReviewed: { type: 'boolean' },
          skipFolders: { type: 'string' },
          incremental: { type: 'boolean' },
          force: { type: 'boolean' },
          verbose: { type: 'boolean' },
          rules: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const {
      pr_url,
      owner,
      org,
      project,
      repo,
      pr,
      model,
      language,
      postComment = true,
      inline = true,
      skipIfReviewed = true,
      skipFolders,
      incremental,
      force,
      verbose,
      rules,
    } = req.body;

    reply.hijack();
    const presenter = new SseReviewPresenter(reply.raw);
    presenter.start();

    try {
      const result = await runReview({
        url: pr_url,
        owner,
        org,
        project,
        repo,
        pr,
        model,
        language,
        postComment,
        inline,
        skipIfReviewed,
        skipFolders,
        incremental,
        force,
        verbose,
        rules,
        onProgress: ({ phase, message }) => presenter.sendProgress(phase, message),
      });

      presenter.sendResult(result);
    } catch (error) {
      presenter.sendError(error);
    } finally {
      presenter.end();
    }
  });
}