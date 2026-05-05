# Berean 🔍

> **🌍 Language / Idioma:** **English** | [Português](README.pt-BR.md)

AI-powered code review CLI for **GitHub** and **Azure DevOps** Pull Requests using GitHub Copilot SDK.

*Just as the Bereans examined everything carefully (Acts 17:11), this tool examines your code with diligence.*

## Architecture

Project architecture guidance and the target modular structure live in [docs/architecture.md](docs/architecture.md).

## Features

- 🔐 **Multiple auth methods** - GitHub Token via env var, Copilot CLI, or BYOK
- 🔍 **Automatic diff extraction** - Fetches changes directly from GitHub or Azure DevOps
- 🤖 **AI code review** - Multiple models (GPT-4o, Claude, Gemini, o3-mini)
- 📊 **Structured output** - Severity levels, suggestions and recommendations
- 💬 **PR comments** - Posts reviews directly on GitHub or Azure DevOps PRs
- 📝 **Inline comments** - Comments on specific code lines
- 🔄 **Anti-loop protection** - Prevents infinite review cycles in CI/CD
- 🌍 **Multi-language** - Responses in any language
- 🏭 **CI/CD ready** - 100% configurable via environment variables
- 🌐 **Web Server** - Review requests via HTTP REST API
- 🦙 **Ollama support** - Run reviews with local models via Ollama (no cloud required)
- 🔁 **Fallback model** - Automatic retry with a secondary provider when the primary fails

## Installation

```bash
# Use the install script (recommended)
curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash

# Or clone and link manually
git clone https://github.com/iatecbr/IATec.AI.WorkFlow.Review.Berean.git ~/.berean-cli
cd ~/.berean-cli && npm install && npm run build && npm link
```

**Prerequisite:** GitHub Copilot CLI

```bash
npm install -g @github/copilot
```

> **Note:** This is a private package — not published to npm. Install via clone + link.



## Quick Start

### Option 1: Environment Variables (only when your token type is accepted by the Copilot endpoint)

```bash
# GitHub Token (any of these)
# Note: a regular PAT may fail with 403 on /copilot_internal/v2/token.
# For local development, prefer `berean auth login`.
export GITHUB_TOKEN="ghp_xxxxx"
# or: export GH_TOKEN="ghp_xxxxx"
# or: export COPILOT_GITHUB_TOKEN="ghp_xxxxx"

# Azure DevOps PAT (only needed for Azure DevOps PRs)
export AZURE_DEVOPS_PAT="xxxxx"

# (Optional) Model, language, and rules size
export BEREAN_MODEL="claude-sonnet-4"
export BEREAN_LANGUAGE="English"
export BEREAN_MAX_RULES_CHARS="50000"

# Review a GitHub PR
berean review https://github.com/owner/repo/pull/123

# Review an Azure DevOps PR
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123
```

### Option 2: Interactive Login (local development)

```bash
# 1. Authenticate with GitHub Copilot
berean auth login

# 2. (Optional) Configure Azure DevOps PAT (only for Azure DevOps PRs)
berean config set azure-pat <your-pat>

# 3. Review a PR
berean review https://github.com/owner/repo/pull/123
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123
```

### Option 3: Webserver HTTP & Docker

#### Using the HTTP Webserver

Berean can be run as an HTTP server to receive review requests via REST API.

##### Start the web server:

```bash
berean web
# or specify host/port:
HOST=0.0.0.0 PORT=3000 berean web
```

By default, the server listens at `http://localhost:3000`.

##### Available Endpoints:

- `POST /review` — Executes a Pull Request review
  - Body JSON:
    ```json
    {
      "pr_url": "https://github.com/owner/repo/pull/123",
      "model": "gpt-4o",
      "language": "English",
      "postComment": true,
      "inline": true
    }
    ```
- `POST /auth` — Executes Copilot authentication (useful for automated flows)

See full examples in [src/routes/review.ts](src/routes/review.ts) and [src/routes/auth.ts](src/routes/auth.ts).

The terminal banner shows all local IPs for network access.

---

#### Using via Docker

You can easily run Berean in a Docker container:

#### Build the imagem:

```bash
docker build -t berean .
```

#### Run the webserver via Docker:

```bash
docker run --rm -p 3000:3000 \
  -e GITHUB_TOKEN=ghp_xxxxx \
  -e AZURE_DEVOPS_PAT=xxxxx \
  berean
```

By default, the container starts the webserver (`CMD [ "web" ]`).

You can customize environment variables as needed.

---

## Environment Variables

All settings can be configured via environment variables, ideal for CI/CD:

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub token for GitHub PRs and HTTP Copilot auth attempts | Yes* |
| `GH_TOKEN` | Alternative to GITHUB_TOKEN (GitHub CLI compat.) | Yes* |
| `COPILOT_GITHUB_TOKEN` | Alternative to GITHUB_TOKEN (highest priority) | Yes* |
| `GITHUBTOKEN` | Alternative (Azure DevOps Variable Groups format) | Yes* |
| `AZURE_DEVOPS_PAT` | Azure DevOps Personal Access Token | For Azure PRs |
| `AZUREDEVOPSPAT` | Alternative (Azure DevOps Variable Groups format) | For Azure PRs |
| `SYSTEM_ACCESSTOKEN` | Azure Pipelines automatic token | For Azure PRs |
| `BEREAN_MODEL` | Default AI model (e.g., `gpt-4o`, `claude-sonnet-4`) | No |
| `BEREANMODEL` | Alternative (Azure DevOps Variable Groups format) | No |
| `BEREAN_LANGUAGE` | Response language (e.g., `English`, `Português do Brasil`) | No |
| `BEREANLANGUAGE` | Alternative (Azure DevOps Variable Groups format) | No |
| `BEREAN_MAX_RULES_CHARS` | Max total chars for rules input | No |
| `BEREANMAXRULESCHARS` | Alternative (Azure DevOps Variable Groups format) | No |
| `BEREAN_VERBOSE` | Verbose logging (token diagnostics and external calls) | No |
| `BEREAN_DEFAULT_MODEL` | Canonical alias for `BEREAN_MODEL` (takes priority over it) | No |
| `BEREAN_FALLBACK_MODEL` | Fallback model when primary fails (e.g., `gpt-4o`, `ollama:llama3.2`) | No |
| `BEREAN_OLLAMA_ENDPOINT` | Ollama server base URL (e.g., `http://localhost:11434`) | For Ollama |
| `OLLAMA_ENDPOINT` | Alternative to `BEREAN_OLLAMA_ENDPOINT` | For Ollama |
| `BEREAN_OLLAMA_MODEL` | Default Ollama model name (e.g., `llama3.2`, `gemma4:12b`) | For Ollama |
| `OLLAMA_MODEL` | Alternative to `BEREAN_OLLAMA_MODEL` | For Ollama |
| `BEREAN_OLLAMA_API_KEY` | API key for protected Ollama endpoints | No |
| `OLLAMA_API_KEY` | Alternative to `BEREAN_OLLAMA_API_KEY` | No |

\* For Copilot, an environment token only works if that token type is accepted by the token exchange endpoint. Personal access tokens may fail with `403 Resource not accessible by personal access token`. For local development, use `berean auth login`.

**Configuration priority:** Environment variable → Config file (`~/.berean/config.json`) → Default value

> **Token diagnostics:** With `BEREAN_VERBOSE=1`, Berean logs which env vars supplied the GitHub and Azure DevOps tokens (without printing the tokens).

Example log:

```text
[berean] GitHub token source: GH_TOKEN
[berean] Azure DevOps PAT source: SYSTEM_ACCESSTOKEN
```

> **Default max rules size:** If not set, Berean uses ~65% of the selected model's max context (approx. 4 chars per token) to leave room for diff and instructions. If model limits are unavailable, it falls back to 50,000 chars.

> **💡 Azure DevOps Variable Groups:** Variables defined in Azure Pipelines Variable Groups have dots and hyphens stripped (e.g., `Berean.Model` becomes `BEREAN_MODEL`, `BereanModel` becomes `BEREANMODEL`). Berean accepts both formats automatically.

---

## CI/CD Integration

### GitHub Actions (for GitHub PRs)

```yaml
name: AI Code Review

on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Copilot CLI and Berean
        run: |
          npm install -g @github/copilot
          curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash
          echo "$(npm prefix -g)/bin" >> $GITHUB_PATH

      - name: Run AI Review
        run: |
          berean review "https://github.com/${{ github.repository }}/pull/${{ github.event.pull_request.number }}" \
            --post-comment --inline --skip-if-reviewed
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BEREAN_MODEL: gpt-4o
```

### Azure Pipelines (for Azure DevOps PRs)

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
      curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash
      echo "##vso[task.prependpath]$(npm prefix -g)/bin"
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
   - For GitHub PRs: needs repository read and pull request write permissions
   - For Copilot only (Azure DevOps PRs): no specific repository scope needed

2. **Classic PAT** - `ghp_` prefix
   - For GitHub PRs: `repo` scope (or `public_repo` for public repositories)
   - For Copilot only (Azure DevOps PRs): minimal scope (Copilot subscription verified by account)

3. **OAuth token** - `gho_` or `ghu_` prefix (from a GitHub App)

### GitHub Actions (for Azure DevOps PRs)

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

      - name: Install Copilot CLI and Berean
        run: |
          npm install -g @github/copilot
          curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash
          echo "$(npm prefix -g)/bin" >> $GITHUB_PATH

      - name: Run AI Review
        run: berean review "${{ inputs.pr_url }}" --post-comment --inline
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
          BEREAN_MODEL: gpt-4o
```

### Azure Pipelines (for GitHub PRs)

```yaml
trigger:
  - none

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '22.x'

  - script: |
      npm install -g @github/copilot
      curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash
      echo "##vso[task.prependpath]$(npm prefix -g)/bin"
    displayName: 'Install Copilot CLI and Berean'

  - script: |
      berean review "https://github.com/owner/repo/pull/$(System.PullRequest.PullRequestNumber)" \
        --post-comment --inline --skip-if-reviewed
    displayName: 'AI Code Review'
    env:
      GITHUB_TOKEN: $(GithubToken)
      BEREAN_MODEL: claude-sonnet-4
      BEREAN_LANGUAGE: English
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
#   --owner <owner>       GitHub repository owner (for flag-based usage)
#   --org <organization>  Azure DevOps organization (for flag-based usage)
#   --project <project>   Azure DevOps project (for flag-based usage)
#   --repo <repository>   Repository name
#   --pr <id>             Pull Request ID
#   --model <model>       AI model (overrides BEREAN_MODEL)
#   --language <lang>     Response language (overrides BEREAN_LANGUAGE)
#   --json                JSON output
#   --post-comment        Post review as PR comment
#   --inline              Post inline comments on specific lines
#   --skip-if-reviewed    Skip if already reviewed; review only new commits when present
#   --incremental         Only review new commits
#   --force               Force review even with @berean: ignore
```

#### Supported PR URLs

| Platform | URL Format |
|----------|-----------|
| **GitHub** | `https://github.com/{owner}/{repo}/pull/{number}` |
| **Azure DevOps** | `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` |
| **Azure DevOps** | `https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}` |

### `berean models`

```bash
berean models list      # List available models
berean models select    # Interactive selection
berean models set <id>  # Set default model
berean models current   # Show current model
```

### `berean config`

```bash
berean config set azure-pat <token>         # Save Azure DevOps PAT
berean config set default-model <model>     # Set default model
berean config set fallback-model <model>    # Set fallback model (used when primary fails)
berean config set language <lang>           # Set default language
berean config set max-rules-chars <num>     # Set max rules characters
berean config set ollama-endpoint <url>     # Set Ollama server URL
berean config set ollama-model <model>      # Set default Ollama model
berean config get                           # Show all config
berean config path                          # Show config directory
```

Example:

```bash
berean config set fallback-model gpt-4o
berean config set ollama-endpoint http://localhost:11434
berean config set max-rules-chars 50000
```

---

## Ollama Provider

Berean supports local model inference via [Ollama](https://ollama.com/), with no cloud credentials required.

### Setup

1. Install and start Ollama: https://ollama.com/download
2. Pull a model: `ollama pull llama3.2`
3. Configure Berean:

```bash
# Via environment variables
export BEREAN_OLLAMA_ENDPOINT="http://localhost:11434"
export BEREAN_OLLAMA_MODEL="llama3.2"  # optional — can use model prefix instead

# Or via config
berean config set ollama-endpoint http://localhost:11434
berean config set ollama-model llama3.2
```

### Using Ollama Models

Prefix any model name with `ollama:` to route it to your local Ollama instance:

```bash
berean review <url> --model ollama:llama3.2
berean review <url> --model ollama:gemma4:12b
berean review <url> --model ollama:qwen2.5-coder:14b
```

Setting `BEREAN_DEFAULT_MODEL` with the `ollama:` prefix also works:

```bash
export BEREAN_DEFAULT_MODEL="ollama:llama3.2"
berean review <url>
```

### Ollama with Protected Endpoint

If your Ollama instance requires authentication:

```bash
export BEREAN_OLLAMA_ENDPOINT="https://my-ollama.example.com"
export BEREAN_OLLAMA_API_KEY="my-api-key"
```

---

## Fallback Model

When the primary provider/model fails (HTTP 401, 429, network error, etc.), Berean automatically retries with a configured fallback.

### Configuration

```bash
# Via environment variable
export BEREAN_FALLBACK_MODEL="copilot:gpt-4o"

# Or via config file
berean config set fallback-model copilot:gpt-4o
```

### Examples

```bash
# Use Ollama as primary, GitHub Copilot as fallback
export BEREAN_DEFAULT_MODEL="ollama:llama3.2"
export BEREAN_FALLBACK_MODEL="copilot:gpt-4o"
berean review <url>

# Use Copilot as primary, local Ollama as fallback
export BEREAN_DEFAULT_MODEL="copilot:gpt-4o"
export BEREAN_FALLBACK_MODEL="ollama:llama3.2"
berean review <url>
```

When the fallback is triggered, a progress event is emitted:

```
Primary model failed (HTTP 401: "unauthorized"). Retrying with fallback model "gpt-4o"...
```

---

## Anti-Loop Protection

Add `@berean: ignore` to PR description to skip review. Use `--force` to override.

```bash
# Skip if already reviewed; when new commits exist, only those commits are reviewed
berean review <url> --post-comment --skip-if-reviewed

# Incremental: only new commits
berean review <url> --post-comment --incremental
```

---

## License

MIT

---

*Built with ❤️ by [Berean](https://github.com/iatecbr/IATec.AI.WorkFlow.Review.Berean) 🔍*
