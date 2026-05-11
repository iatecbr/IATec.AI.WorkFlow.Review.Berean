# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build       # Compile TypeScript → dist/ (also sets executable bit)
npm run dev         # Watch mode — recompiles on file changes
npx tsc --noEmit    # Type-check without emitting (use before commits)
node dist/index.js  # Run the compiled CLI
```

There are no automated tests. Type-checking (`npx tsc --noEmit`) is the primary correctness gate.

## Architecture

Berean is an AI-powered code review CLI + HTTP server (Node ≥22, ESM). It reviews GitHub and Azure DevOps PRs using GitHub Copilot or Ollama.

### Layer structure (Clean Architecture)

```
src/
├── domain/          # Entities, value objects, domain services — no infrastructure deps
├── application/     # Use-case orchestration + port interfaces (contracts)
├── infrastructure/  # Concrete implementations of ports (AI adapters, SCM adapters, config)
├── providers/       # ReviewModelPort implementations + ProviderRegistry
├── interfaces/      # Entry points: CLI (Commander) and HTTP (Fastify + SSE)
├── composition/     # container.ts — single wiring point; CLI/HTTP import only from here
└── services/        # Cross-cutting: credentials, rules, model-limits, copilot-auth
```

### Core flow

`interfaces/` → `composition/container.ts` → `application/use-cases/review-pull-request.ts` → `providers/provider-registry.ts` + `infrastructure/source-control/`

### Model routing

Model identifiers use the `<providerId>:<modelName>` convention. The first `:` is the separator, so Ollama tags like `gemma4:31b-cloud` survive intact as the model name.

- `ollama:gemma4:31b` → Ollama provider, model `gemma4:31b`
- `copilot:gpt-4o` or bare `gpt-4o` → Copilot provider (default for unprefixed strings)

The `ProviderRegistry` in `src/providers/provider-registry.ts` handles routing and fallback: if the primary provider returns `success: false` or throws, it retries with `options.fallbackModel`.

### AI response parsing

All AI adapters share `src/infrastructure/ai/review-parser.ts`. The `parseReviewContent` function uses a three-step fallback chain via `??`:

1. `tryParseJson` — direct `JSON.parse` with bracket/brace repair for truncated responses
2. `extractJsonFromMixedContent` — scans for `{` and tries to parse from each position
3. `extractSafeFields` — regex extraction of `summary`, `recommendation`, `positives`, `recommendations` when JSON is invalid (e.g. unescaped quotes in `suggestion` fields containing code)

### HTTP interface (SSE)

`POST /review` streams `event: progress` events for each phase, then a final `event: result`. Implemented in `src/interfaces/http/routes/review.ts` + `src/interfaces/http/presenters/sse-review.presenter.ts`.

### Configuration

- Config file: `~/.berean/config.json`
- Env vars override config. Canonical names are `BEREAN_*`; legacy names (e.g. `BEREAN_MODEL`, `OLLAMA_ENDPOINT`) kept for backward-compat.
- Key env vars: `GITHUB_TOKEN`, `AZURE_DEVOPS_PAT`, `BEREAN_DEFAULT_MODEL`, `BEREAN_OLLAMA_ENDPOINT`, `BEREAN_FALLBACK_MODEL`, `BEREAN_RULES_PATH`.

### Rules system

`src/services/rules.ts` resolves comma-separated sources from `--rules` / `BEREAN_RULES_PATH`:
- File path → read directly
- Directory → all files inside
- Static URL → fetched once
- URL with `{{placeholder}}` → dynamic: the AI generates search queries and each query replaces the placeholder (RAG-style)

Built-in rules always load first (from `src/rules/`); user rules are appended.

### Prompt templates

Markdown templates live in `prompts/review/v1/` and `prompts/query-generation/v1/`. Variables are interpolated with `{{variable}}` syntax via `renderPrompt` in `src/infrastructure/prompts/file-prompt.repository.ts`.

### Incremental reviews

The use-case tracks reviewed commits by embedding a hidden HTML comment (`<!-- berean-commits:...:berean-commits -->`) in the posted PR comment. On the next run it reads this tag, finds new commits, and fetches only the diff since the last review.

### Adding a new AI provider

1. Implement `ReviewModelPort` (`src/application/ports/review-model.port.ts`) with a unique `providerId`.
2. Register the instance in `src/providers/provider-registry.ts` (append to the `providers` array — no other change needed).

### Adding a new SCM platform

1. Implement `SourceControlPort` (`src/application/ports/source-control.port.ts`).
2. Add URL detection and adapter construction in `src/infrastructure/source-control/source-control-registry.ts`.
