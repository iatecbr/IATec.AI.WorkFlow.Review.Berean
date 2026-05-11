# AGENTS.md

## Overview

Berean is an AI-powered code review CLI + HTTP server (Node ≥22, ESM). It reviews GitHub and Azure DevOps PRs using GitHub Copilot or Ollama. See [docs/architecture.md](docs/architecture.md) for the full design and [CLAUDE.md](CLAUDE.md) for additional context.

## Commands

```bash
npm run build       # Compile TypeScript → dist/ (sets executable bit)
npm run dev         # Watch mode
npx tsc --noEmit    # Type-check (primary correctness gate — no tests exist)
```

## Code Conventions

- **ESM only**: All imports must use `.js` extensions (e.g., `import { foo } from './bar.js'`).
- **Relative imports**: No path aliases — always `./` or `../`.
- **File naming**: kebab-case (`review-parser.ts`, `copilot-client.factory.ts`).
- **Classes/interfaces**: PascalCase. Port interfaces use `Port`/`Repository` suffixes.
- **Strict TypeScript**: `strict: true` in tsconfig. Fix all type errors before committing.
- **No linter/formatter**: No ESLint or Prettier config. Follow existing code style.

## Architecture (Clean Architecture)

```
src/
├── domain/          # Entities, value objects, pure services — zero infrastructure deps
├── application/     # Use-case orchestration + port interfaces (contracts)
├── infrastructure/  # Concrete adapters (AI clients, SCM HTTP clients, config)
├── providers/       # ReviewModelPort implementations + ProviderRegistry
├── interfaces/      # Entry points: CLI (Commander) + HTTP (Fastify + SSE)
├── composition/     # container.ts — single wiring point
└── services/        # Cross-cutting: credentials, rules, model-limits, copilot-auth
```

### Dependency rules

- `domain/` must **never** import from `infrastructure/`, `providers/`, `interfaces/`, or `services/`.
- `application/` defines port interfaces; it must **not** depend on concrete implementations.
- `interfaces/` (CLI, HTTP) import **only** from `composition/container.ts` — never directly from application or infrastructure.

### Key flow

`interfaces/` → `composition/container.ts` → `application/use-cases/review-pull-request.ts` → `providers/provider-registry.ts` + `infrastructure/source-control/`

## Adding a New AI Provider

1. Implement `ReviewModelPort` (defined in `src/application/ports/review-model.port.ts`) with a unique `providerId`.
2. Append the instance to the `providers` array in `src/providers/provider-registry.ts`.
3. No other changes needed — routing is automatic via `<providerId>:<modelName>` convention.

## Adding a New SCM Platform

1. Implement `SourceControlPort` (`src/application/ports/source-control.port.ts`).
2. Add URL detection and adapter construction in `src/infrastructure/source-control/source-control-registry.ts`.

## Error Handling

- **Domain errors**: Throw `DomainError` (from `src/domain/shared/errors.ts`).
- **Uncertain operations**: Use `Result<T, E>` with `ok()`/`fail()` (from `src/domain/shared/result.ts`).
- **Provider failures**: Return `{ success: false, error: string }` — don't throw. The `ProviderRegistry` handles fallback/retry for retryable errors (5xx, timeouts, 429).
- **User-facing messages**: Use `extractErrorMessage()` from `src/lib/errors.ts`.

## Model Routing

Format: `<providerId>:<modelName>`. The first `:` is the separator.

- `ollama:gemma4:31b` → Ollama provider, model `gemma4:31b`
- `copilot:gpt-4o` or bare `gpt-4o` → Copilot provider (default for unprefixed strings)

## Configuration

- Config file: `~/.berean/config.json`
- Env vars override config. Canonical prefix: `BEREAN_*`.
- Key env vars: `GITHUB_TOKEN`, `AZURE_DEVOPS_PAT`, `BEREAN_DEFAULT_MODEL`, `BEREAN_OLLAMA_ENDPOINT`, `BEREAN_FALLBACK_MODEL`, `BEREAN_RULES_PATH`.
