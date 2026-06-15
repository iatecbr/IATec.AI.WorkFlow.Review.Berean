# Contributing to Berean

Thanks for your interest in contributing! This guide covers the essentials to get you started.

## Prerequisites

- **Node.js >= 22**
- **npm** (comes with Node)
- **GitHub Copilot CLI** — `npm install -g @github/copilot`

## Getting Started

```bash
git clone https://github.com/iatecbr/IATec.AI.WorkFlow.Review.Berean.git
cd IATec.AI.WorkFlow.Review.Berean
npm install
npm run build
```

To verify your setup:

```bash
npx tsc --noEmit   # must pass with zero errors
node dist/index.js --help
```

## Development Workflow

### 1. Fork and branch

```bash
git checkout -b fix/your-descriptive-branch-name
```

Use conventional branch prefixes:
- `fix/` — bug fixes
- `feat/` — new features
- `docs/` — documentation
- `refactor/` — code restructuring
- `test/` — test additions

### 2. Develop

```bash
npm run dev    # watch mode — recompiles on save
```

### 3. Verify before committing

```bash
npx tsc --noEmit    # type-check (primary correctness gate)
npm run build        # must compile without errors
```

There are no automated tests or linters configured. **Type-checking is the gate** — `npx tsc --noEmit` must pass with zero errors.

### 4. Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
fix: align CLI version with package.json
docs: fix broken route paths in README
feat: add GitLab as SCM provider
refactor: extract review parser into shared module
```

### 5. Open a Pull Request

- Reference any related issues in the PR description.
- Keep PRs focused — one logical change per PR.
- Include a summary of what changed and why.

## Code Conventions

| Area | Convention |
|------|-----------|
| Module system | **ESM only** — all imports use `.js` extensions (`import { foo } from './bar.js'`) |
| Relative imports | No path aliases — always `./` or `../` |
| File naming | `kebab-case` (`review-parser.ts`, `copilot-client.factory.ts`) |
| Classes & interfaces | `PascalCase`. Port interfaces use `Port`/`Repository` suffix |
| TypeScript | `strict: true` — fix all type errors before committing |
| Linter / Formatter | None configured. Follow existing code style |

## Architecture

Berean follows Clean Architecture. See [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md) for full details.

```
src/
├── domain/          # Entities, value objects — zero infrastructure deps
├── application/     # Use-cases + port interfaces (contracts)
├── infrastructure/  # Concrete adapters (AI clients, SCM clients, config)
├── providers/       # ReviewModelPort implementations + ProviderRegistry
├── interfaces/      # Entry points: CLI (Commander) + HTTP (Fastify + SSE)
├── composition/     # container.ts — single wiring point
└── services/        # Cross-cutting: credentials, rules, model-limits
```

### Dependency rules

- `domain/` **must never** import from `infrastructure/`, `providers/`, `interfaces/`, or `services/`.
- `application/` defines port interfaces and **must not** depend on concrete implementations.
- `interfaces/` (CLI, HTTP) import **only** from `composition/container.ts`.

### Extending

**Adding an AI provider:**
1. Implement `ReviewModelPort` (`src/application/ports/review-model.port.ts`) with a unique `providerId`.
2. Append the instance in `src/providers/provider-registry.ts`.

**Adding an SCM platform:**
1. Implement `SourceControlPort` (`src/application/ports/source-control.port.ts`).
2. Add URL detection in `src/infrastructure/source-control/source-control-registry.ts`.

## Reporting Issues

When reporting a bug, include:

- Berean version (`berean --version`)
- Node.js version (`node --version`)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (redact tokens/credentials)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
