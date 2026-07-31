# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2026-05-11

### Changed
- Extracted AI response parsing into a shared `review-parser` module

## [2.0.0] - 2026-05-05

### Added
- Clean Architecture refactor: domain entities, review scope, and issue filter services
- Ollama provider with auto-detection of OpenAI-compatible endpoints (`/v1`)
- Fallback model support with progress events
- `ConfigPort` and `EnvConfigRepository` for environment-based configuration
- HTTP server with `/review` route for programmatic access
- Single wiring point (`container.ts`) for the interfaces layer

### Changed
- Restructured into Clean Architecture layers: `domain/`, `infrastructure/`, `interfaces/`
- Moved commands to `interfaces/cli/` and routes to `interfaces/http/`
- Moved AI providers to `infrastructure/ai/` and SCM integrations to `infrastructure/scm/`
- Split monolithic Copilot provider into modular files
- Documented Ollama provider, fallback model, and new environment variables

## [1.11.0] - 2026-05-05

### Changed
- Simplified tracked commit tagging assignment
- Extracted `ReviewRequestBody` interface and simplified HTTP handler

### Fixed
- Review all unreviewed commits based on Berean tags

## [1.10.0] - 2026-04-28

### Added
- Incremental reviews scoped to new commits using GitHub compare ranges
- PR summaries scoped to new commits only

### Fixed
- Handle commit fetch gaps in incremental diffs
- Guard previous commit lookup
- Azure new commit filtering with Set-based deduplication

## [1.1.2] - 2026-02-19

### Added
- Dynamic rules handling with URL support and rule source parsing
- Verbose logging mode
- Core CLI functionality: authentication, configuration, model management, and PR reviews

### Fixed
- Actionable error messages for Copilot token exchange failures

## [1.1.1] - 2026-02-19

### Fixed
- Scope SDK bypass to Azure DevOps only, not generic CI environments

## [1.1.0] - 2026-02-19

### Fixed
- Ensure `berean` binary has full execution permissions in install script

## [1.0.1] - 2026-02-19

### Fixed
- Always clean previous install directory before installation
- Force correct origin URL before fetch to prevent stale remote issues

## [1.0.0] - 2026-02-19

First stable release.

## [0.4.2] - 2026-02-19

### Fixed
- Self-update install script using `git reset --hard` and re-exec for latest version

## [0.4.0] - 2026-02-19

### Changed
- Renamed package from `@iatec/berean` to `berean`

### Added
- Rules path configuration with loading from multiple sources
- Proper incremental review scoped to new commits
- Install script includes devDependencies and builds TypeScript sources
- Version info display during install/update

## [0.0.1] - 2026-02-18

### Added
- Azure DevOps integration for pull request handling
- Initial commit
