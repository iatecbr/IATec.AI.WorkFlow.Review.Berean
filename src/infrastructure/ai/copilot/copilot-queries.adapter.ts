import { approveAll } from '@github/copilot-sdk';
import { getPromptRepository, renderPrompt } from '../../prompts/file-prompt.repository.js';
import { getClient, log } from './copilot-client.factory.js';
import { stripProviderPrefix } from '../../../domain/shared/model-identifier.js';

/**
 * Ask the LLM to generate search queries relevant to the provided diff.
 * Used by dynamic URL rule sources (those with a {{query}} placeholder).
 *
 * @param diff     PR diff used to derive queries.
 * @param model    Model identifier used for query generation.
 */
export async function generateRuleQueries(diff: string, model: string): Promise<string[]> {
  model = stripProviderPrefix(model, 'copilot');
  const repository = getPromptRepository();
  const [systemPrompt, userTemplate] = await Promise.all([
    repository.getPrompt('query-generation/v1/system.md'),
    repository.getPrompt('query-generation/v1/user.md'),
  ]);
  const userPrompt = renderPrompt(userTemplate, {
    diffExcerpt: diff.substring(0, 2_000),
  });

  let content = '';

  try {
    const client = await getClient();
    await client.start();
    const session = await client.createSession({
      model,
      streaming: false,
      systemMessage: { mode: 'replace', content: systemPrompt },
      onPermissionRequest: approveAll,
    });
    const response = await session.sendAndWait({ prompt: userPrompt }, 30_000);
    content = (response?.data?.content as string) ?? '';
  } catch (e) {
    log(`[berean] generateRuleQueries SDK failed: ${e instanceof Error ? e.message : e}`);
    return [];
  }

  if (!content) return [];

  try {
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      return Array.isArray(parsed)
        ? (parsed as unknown[]).filter(q => typeof q === 'string').slice(0, 5) as string[]
        : [];
    }
  } catch {
    log(`[berean] generateRuleQueries failed to parse response: ${content.substring(0, 100)}`);
  }

  return [];
}
