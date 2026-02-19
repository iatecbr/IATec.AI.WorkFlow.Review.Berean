/**
 * Rules loader — loads project guidelines/rules from ordered sources.
 *
 * Supported source types (processed in array order):
 *  - Local file path   → reads the file content
 *  - Local directory   → reads and concatenates all non-hidden files
 *  - HTTP/HTTPS URL    → fetches the URL; supports {{query}} placeholder
 *    that is replaced by a search query derived from the current PR context
 *    (PR title + changed file names).
 *
 * Example URL source:
 *   https://example.com/kb/search?q={{query}}
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RulesContext {
  /** PR title used to build the search query for URL sources. */
  prTitle?: string;
  /** Paths of files changed in the PR (basenames used in the query). */
  filePaths?: string[];
}

export type LoadResult =
  | { ok: true;  label: string; content: string }
  | { ok: false; label: string; error: string };

export interface LoadRulesResult {
  /** Concatenated content from all successful sources, separated by `---`. */
  content: string | undefined;
  /** Per-source result for progress reporting. */
  results: LoadResult[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getSourceLabel(source: string): string {
  if (source.startsWith('https://') || source.startsWith('http://')) {
    try {
      // Strip {{placeholders}} before parsing so URL() doesn't throw
      return new URL(source.replace(/\{\{[^}]+\}\}/g, '_')).hostname;
    } catch {
      return source.substring(0, 60);
    }
  }
  return source;
}

/**
 * Build a concise search query from the PR context.
 * Format: "<PR title> <file1> <file2> ..."  (max 200 chars)
 */
function buildSearchQuery(context?: RulesContext): string {
  const parts: string[] = [];

  if (context?.prTitle) {
    parts.push(context.prTitle);
  }

  if (context?.filePaths?.length) {
    const names = context.filePaths
      .slice(0, 10)
      .map(p => path.basename(p))
      .join(' ');
    parts.push(names);
  }

  return parts.join(' ').substring(0, 200).trim();
}

async function loadFromUrl(rawUrl: string, context?: RulesContext): Promise<string> {
  const query = buildSearchQuery(context);
  const resolvedUrl = rawUrl.replace(/\{\{query\}\}/gi, encodeURIComponent(query));

  const response = await fetch(resolvedUrl, {
    headers: { 'Accept': 'text/plain, application/json, */*' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${resolvedUrl}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data = await response.json() as unknown;

    // Scalar string
    if (typeof data === 'string') return data;

    // Common single-field shapes: { content, text, data, rules, result, message }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      for (const key of ['content', 'text', 'data', 'rules', 'result', 'message']) {
        if (typeof obj[key] === 'string') return obj[key] as string;
      }
    }

    // Array of strings
    if (Array.isArray(data) && data.every(i => typeof i === 'string')) {
      return (data as string[]).join('\n');
    }

    // Fallback: pretty-print the JSON so the model can still parse it
    return JSON.stringify(data, null, 2);
  }

  return response.text();
}

function loadFromDirectory(dirPath: string): string {
  const files = fs.readdirSync(dirPath)
    .filter(f => !f.startsWith('.'))
    .sort();

  const parts: string[] = [];
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isFile()) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      parts.push(`### ${file}\n\n${content}`);
    }
  }
  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load rules from an ordered list of sources.
 *
 * Sources are processed in array order. Failed sources produce a warning
 * entry but do not abort the remaining ones.
 *
 * @param sources  Array of file paths, directory paths, or URLs.
 * @param context  Optional PR context used to build the URL query string.
 */
export async function loadRules(
  sources: string[],
  context?: RulesContext,
): Promise<LoadRulesResult> {
  if (sources.length === 0) return { content: undefined, results: [] };

  const results: LoadResult[] = [];
  const parts: string[] = [];

  for (const raw of sources) {
    const source = raw.trim();
    if (!source) continue;

    const label = getSourceLabel(source);
    const isUrl = source.startsWith('https://') || source.startsWith('http://');

    try {
      let content: string;

      if (isUrl) {
        content = await loadFromUrl(source, context);
      } else {
        const absPath = path.resolve(source);
        if (!fs.existsSync(absPath)) {
          throw new Error(`Path not found: ${source}`);
        }
        const stat = fs.statSync(absPath);
        content = stat.isDirectory()
          ? loadFromDirectory(absPath)
          : fs.readFileSync(absPath, 'utf-8');
      }

      const trimmed = content.trim();
      if (trimmed) {
        parts.push(trimmed);
        results.push({ ok: true, label, content: trimmed });
      } else {
        results.push({ ok: false, label, error: 'empty response' });
      }
    } catch (err) {
      results.push({
        ok: false,
        label,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    content: parts.length > 0 ? parts.join('\n\n---\n\n') : undefined,
    results,
  };
}
