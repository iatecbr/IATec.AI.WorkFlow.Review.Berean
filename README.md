# Berean 🔍

> **🌍 Language / Idioma:** **English** | [Português](README.pt-BR.md)

AI-powered code review CLI for Azure DevOps Pull Requests using GitHub Copilot SDK.

*Just as the Bereans examined everything carefully (Acts 17:11), this tool examines your code with diligence.*

## Features

- 🔐 **Multiple auth methods** - GitHub Token via env var, Copilot CLI, or BYOK
- 🔍 **Automatic diff extraction** - Fetches changes directly from Azure DevOps
- 🤖 **AI code review** - Multiple models (GPT-4o, Claude, Gemini, o3-mini)
- 📊 **Structured output** - Severity levels, suggestions and recommendations
- 💬 **PR comments** - Posts reviews directly on Azure DevOps PRs
- 📝 **Inline comments** - Comments on specific code lines
- 🔄 **Anti-loop protection** - Prevents infinite review cycles in CI/CD
- 🌍 **Multi-language** - Responses in any language
- 🏭 **CI/CD ready** - 100% configurable via environment variables

## Installation

```bash
# Clone and link (recommended)
git clone https://github.com/rajada1/berean.git ~/.berean-cli
cd ~/.berean-cli && npm install && npm link

# Or use the install script
curl -fsSL https://raw.githubusercontent.com/rajada1/berean/main/install.sh | bash
```

**Prerequisite:** GitHub Copilot CLI

```bash
npm install -g @github/copilot
```

> **Note:** This is a private package — not published to npm. Install via clone + link.

## Quick Start

### Option 1: Environment Variables (recommended for CI/CD)

```bash
# GitHub Token (any of these)
export GITHUB_TOKEN="ghp_xxxxx"
# or: export GH_TOKEN="ghp_xxxxx"
# or: export COPILOT_GITHUB_TOKEN="ghp_xxxxx"

# Azure DevOps PAT
export AZURE_DEVOPS_PAT="xxxxx"

# (Optional) Model and language
export BEREAN_MODEL="claude-sonnet-4"
export BEREAN_LANGUAGE="English"

# Review a PR
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123
```

### Option 2: Interactive Login (local development)

```bash
# 1. Authenticate with GitHub Copilot
berean auth login

# 2. Configure Azure DevOps PAT
berean config set azure-pat <your-pat>

# 3. Review a PR
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123
```

---

## Environment Variables

All settings can be configured via environment variables, ideal for CI/CD:

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub token for Copilot API | Yes* |
| `GH_TOKEN` | Alternative to GITHUB_TOKEN (GitHub CLI compat.) | Yes* |
| `COPILOT_GITHUB_TOKEN` | Alternative to GITHUB_TOKEN (highest priority) | Yes* |
| `GITHUBTOKEN` | Alternative (Azure DevOps Variable Groups format) | Yes* |
| `AZURE_DEVOPS_PAT` | Azure DevOps Personal Access Token | Yes |
| `AZUREDEVOPSPAT` | Alternative (Azure DevOps Variable Groups format) | Yes |
| `SYSTEM_ACCESSTOKEN` | Azure Pipelines automatic token | Yes |
| `BEREAN_MODEL` | Default AI model (e.g., `gpt-4o`, `claude-sonnet-4`) | No |
| `BEREANMODEL` | Alternative (Azure DevOps Variable Groups format) | No |
| `BEREAN_LANGUAGE` | Response language (e.g., `English`, `Português do Brasil`) | No |
| `BEREANLANGUAGE` | Alternative (Azure DevOps Variable Groups format) | No |

\* At least one GitHub token is required (or login via Copilot CLI).

**Configuration priority:** Environment variable → Config file (`~/.berean/config.json`) → Default value

> **💡 Azure DevOps Variable Groups:** Variables defined in Azure Pipelines Variable Groups have dots and hyphens stripped (e.g., `Berean.Model` becomes `BEREAN_MODEL`, `BereanModel` becomes `BEREANMODEL`). Berean accepts both formats automatically.

---

## CI/CD Integration

### Azure Pipelines

```yaml
trigger:
  - none

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '22.x'

  - script: |
      npm install -g @github/copilot
      git clone https://github.com/rajada1/berean.git /tmp/berean
      cd /tmp/berean && npm install && npm link
    displayName: 'Install Copilot CLI and Berean'

  - script: |
      PR_URL="https://dev.azure.com/$(System.CollectionUri)/$(System.TeamProject)/_git/$(Build.Repository.Name)/pullrequest/$(System.PullRequest.PullRequestId)"
      berean review "$PR_URL" --post-comment --inline --skip-if-reviewed
    displayName: 'Run AI Code Review'
    env:
      GITHUB_TOKEN: $(GithubToken)
      AZURE_DEVOPS_PAT: $(System.AccessToken)
      BEREAN_MODEL: claude-sonnet-4
      BEREAN_LANGUAGE: English
```

### Azure DevOps Variables Setup

1. Go to **Pipelines** → **Library** → **Variable Groups** (or directly in the pipeline)
2. Add the variables:

| Variable | Value | Secret? |
|----------|-------|---------|
| `GithubToken` | Your GitHub PAT (`ghp_xxx`) or OAuth token | ✅ Yes |
| `BEREAN_MODEL` | `gpt-4o` or `claude-sonnet-4` etc. | No |
| `BEREAN_LANGUAGE` | `English` or `Português do Brasil` | No |

> **Note:** `AZURE_DEVOPS_PAT` can use `$(System.AccessToken)` which is the pipeline's automatic token. Make sure the Build Service has **Contribute to pull requests** permission on the repository.

### Azure DevOps PAT Permissions

If using a manual PAT instead of `System.AccessToken`:

| Scope | Permission |
|-------|-----------|
| **Code** | Read |
| **Pull Request Threads** | Read & Write |

### GitHub Token Options

1. **Fine-grained PAT** - Create at github.com → Settings → Developer settings → Fine-grained tokens
   - No specific repository scope needed
   - Just needs an active GitHub Copilot subscription on the account

2. **Classic PAT** - `ghp_` prefix
   - Minimal scope: none (Copilot subscription is verified by account)

3. **OAuth token** - `gho_` or `ghu_` prefix (from a GitHub App)

### GitHub Actions

```yaml
name: AI Code Review

on:
  workflow_dispatch:
    inputs:
      pr_url:
        description: 'Azure DevOps PR URL'
        required: true

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: |
          npm install -g @github/copilot
          git clone https://github.com/rajada1/berean.git /tmp/berean
          cd /tmp/berean && npm install && npm link

      - name: Run AI Review
        run: berean review "${{ inputs.pr_url }}" --post-comment --inline
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
          BEREAN_MODEL: gpt-4o
```

---

## Commands

### `berean auth`

```bash
berean auth login    # Authenticate via Copilot CLI
berean auth logout   # Sign out
berean auth status   # Check auth status
```

### `berean review`

```bash
berean review <url> [options]

# Options:
#   --model <model>       AI model (overrides BEREAN_MODEL)
#   --language <lang>     Response language (overrides BEREAN_LANGUAGE)
#   --json                JSON output
#   --post-comment        Post review as PR comment
#   --inline              Post inline comments on specific lines
#   --skip-if-reviewed    Skip if already reviewed
#   --incremental         Only review new commits
#   --force               Force review even with @berean: ignore
```

### `berean models`

```bash
berean models list      # List available models
berean models select    # Interactive selection
berean models set <id>  # Set default model
berean models current   # Show current model
```

### `berean config`

```bash
berean config set azure-pat <token>      # Save Azure DevOps PAT
berean config set default-model <model>  # Set default model
berean config set language <lang>        # Set default language
berean config get                        # Show all config
berean config path                       # Show config directory
```

---

## Anti-Loop Protection

Add `@berean: ignore` to PR description to skip review. Use `--force` to override.

```bash
# Skip if already reviewed
berean review <url> --post-comment --skip-if-reviewed

# Incremental: only new commits
berean review <url> --post-comment --incremental
```

---

## License

MIT

---

*Built with ❤️ by [Berean](https://github.com/rajada1/berean) 🔍*
