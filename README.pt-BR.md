# Berean 🔍

> CLI de code review com IA para Pull Requests do **GitHub** e **Azure DevOps** usando GitHub Copilot SDK.

*Assim como os Bereanos que examinavam tudo cuidadosamente (Atos 17:11), esta ferramenta examina seu código com diligência.*

## Funcionalidades

- 🔐 **Múltiplas formas de autenticação** - GitHub Token via env var, Copilot CLI, ou BYOK
- 🔍 **Extração automática de diff** - Busca alterações diretamente do GitHub ou Azure DevOps
- 🤖 **Code review com IA** - Múltiplos modelos (GPT-4o, Claude, Gemini, o3-mini)
- 📊 **Saída estruturada** - Níveis de severidade, sugestões e recomendações
- 💬 **Comentários no PR** - Posta reviews diretamente nos PRs do GitHub ou Azure DevOps
- 📝 **Comentários inline** - Comenta em linhas específicas do código
- 🔄 **Proteção anti-loop** - Previne ciclos infinitos de review em CI/CD
- 🌍 **Multi-idioma** - Respostas em qualquer idioma
- 🏭 **Pronto para CI/CD** - 100% configurável via variáveis de ambiente
- 🌐 **Web Server** - Solicitações de revisão via API REST HTTP
- 🦙 **Suporte a Ollama** - Execute reviews com modelos locais via Ollama (sem cloud)
- 🔁 **Modelo fallback** - Retry automático com provedor secundário quando o principal falhar

## Instalação

```bash
# Use o script de instalação (recomendado)
curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash

# Ou clone e link manualmente
git clone https://github.com/iatecbr/IATec.AI.WorkFlow.Review.Berean.git ~/.berean-cli
cd ~/.berean-cli && npm install && npm run build && npm link
```

**Pré-requisito:** GitHub Copilot CLI

```bash
npm install -g @github/copilot
```

> **Nota:** Este é um pacote privado — não publicado no npm. Instale via clone + link.

## Início Rápido

### Opção 1: Variáveis de Ambiente (somente quando seu token for aceito pelo endpoint do Copilot)

```bash
# Token do GitHub (qualquer uma dessas)
# Atenção: um PAT comum pode falhar com 403 em /copilot_internal/v2/token.
# Para uso local, prefira `berean auth login`.
export GITHUB_TOKEN="ghp_xxxxx"
# ou: export GH_TOKEN="ghp_xxxxx"
# ou: export COPILOT_GITHUB_TOKEN="ghp_xxxxx"

# PAT do Azure DevOps (apenas para PRs do Azure DevOps)
export AZURE_DEVOPS_PAT="xxxxx"

# (Opcional) Modelo, idioma e tamanho das regras
export BEREAN_MODEL="claude-sonnet-4"
export BEREAN_LANGUAGE="Português do Brasil"
export BEREAN_MAX_RULES_CHARS="50000"

# Revisar um PR do GitHub
berean review https://github.com/owner/repo/pull/123

# Revisar um PR do Azure DevOps
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123
```

### Opção 2: Login Interativo (desenvolvimento local)

```bash
# 1. Autenticar com GitHub Copilot
berean auth login

# 2. (Opcional) Configurar PAT do Azure DevOps (apenas para PRs do Azure DevOps)
berean config set azure-pat <seu-pat>

# 3. Revisar um PR
berean review https://github.com/owner/repo/pull/123
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123
```

### Opção 3:  Webserver HTTP & Docker

#### Usando o Webserver HTTP

O Berean pode ser executado como um servidor HTTP para receber requisições de review via API REST.

#### Iniciar o servidor web:

```bash
berean web
# ou especifique host/porta:
HOST=0.0.0.0 PORT=3000 berean web
```

Por padrão, o servidor escuta em `http://localhost:3000`.

#### Endpoints disponíveis:

- `POST /review` — Executa review de um Pull Request
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
- `POST /auth` — Executa autenticação Copilot (útil para flows automatizados)

Veja exemplos completos em [src/routes/review.ts](src/routes/review.ts) e [src/routes/auth.ts](src/routes/auth.ts).

O banner do terminal mostra todos os IPs locais para acesso em rede.

---

#### Usando via Docker

Você pode rodar o Berean facilmente em container Docker:

#### Build da imagem:

```bash
docker build -t berean .
```

#### Rodar o webserver via Docker:

```bash
docker run --rm -p 3000:3000 \
  -e GITHUB_TOKEN=ghp_xxxxx \
  -e AZURE_DEVOPS_PAT=xxxxx \
  berean
```

Por padrão, o container já inicia o webserver (`CMD [ "web" ]`).

Você pode customizar variáveis de ambiente conforme necessário.

---


---

## Variáveis de Ambiente

Todas as configurações podem ser definidas via variáveis de ambiente, ideal para CI/CD:

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| `GITHUB_TOKEN` | Token do GitHub para PRs do GitHub e tentativa de auth HTTP do Copilot | Sim* |
| `GH_TOKEN` | Alternativa ao GITHUB_TOKEN (compat. GitHub CLI) | Sim* |
| `COPILOT_GITHUB_TOKEN` | Alternativa ao GITHUB_TOKEN (prioridade máxima) | Sim* |
| `GITHUBTOKEN` | Alternativa (formato Azure DevOps Variable Groups) | Sim* |
| `AZURE_DEVOPS_PAT` | Personal Access Token do Azure DevOps | Para PRs Azure |
| `AZUREDEVOPSPAT` | Alternativa (formato Azure DevOps Variable Groups) | Para PRs Azure |
| `SYSTEM_ACCESSTOKEN` | Token automático do Azure Pipelines | Para PRs Azure |
| `BEREAN_MODEL` | Modelo de IA padrão (ex: `gpt-4o`, `claude-sonnet-4`) | Não |
| `BEREANMODEL` | Alternativa (formato Azure DevOps Variable Groups) | Não |
| `BEREAN_LANGUAGE` | Idioma das respostas (ex: `Português do Brasil`) | Não |
| `BEREANLANGUAGE` | Alternativa (formato Azure DevOps Variable Groups) | Não |
| `BEREAN_MAX_RULES_CHARS` | Máximo de caracteres para regras | Não |
| `BEREANMAXRULESCHARS` | Alternativa (formato Azure DevOps Variable Groups) | Não |
| `BEREAN_VERBOSE` | Log detalhado (diagnóstico de tokens e chamadas externas) | Não |
| `BEREAN_DEFAULT_MODEL` | Alias canônico para `BEREAN_MODEL` (tem prioridade sobre ele) | Não |
| `BEREAN_FALLBACK_MODEL` | Modelo fallback quando o principal falhar (ex: `gpt-4o`, `ollama:llama3.2`) | Não |
| `BEREAN_OLLAMA_ENDPOINT` | URL base do servidor Ollama (ex: `http://localhost:11434`) | Para Ollama |
| `OLLAMA_ENDPOINT` | Alternativa a `BEREAN_OLLAMA_ENDPOINT` | Para Ollama |
| `BEREAN_OLLAMA_MODEL` | Modelo Ollama padrão (ex: `llama3.2`, `gemma4:12b`) | Para Ollama |
| `OLLAMA_MODEL` | Alternativa a `BEREAN_OLLAMA_MODEL` | Para Ollama |
| `BEREAN_OLLAMA_API_KEY` | Chave de API para endpoints Ollama protegidos | Não |
| `OLLAMA_API_KEY` | Alternativa a `BEREAN_OLLAMA_API_KEY` | Não |

\* Para o Copilot, um token de ambiente so funciona se esse tipo de token for aceito pelo endpoint de troca. PATs pessoais podem falhar com `403 Resource not accessible by personal access token`. Em ambiente local, use `berean auth login`.

**Prioridade de configuração:** Variável de ambiente → Arquivo de config (`~/.berean/config.json`) → Valor padrão

> **Diagnóstico de tokens:** Com `BEREAN_VERBOSE=1`, o Berean registra a origem do token do GitHub e do Azure DevOps (sem imprimir os tokens).

Exemplo de log:

```text
[berean] GitHub token source: GH_TOKEN
[berean] Azure DevOps PAT source: SYSTEM_ACCESSTOKEN
```

> **Tamanho máximo de regras:** Se não for definido, o Berean usa ~65% do limite do modelo selecionado (aprox. 4 chars por token) para sobrar espaço para diff e instrucoes. Se o limite do modelo não estiver disponível, usa 50.000 chars.

> **💡 Azure DevOps Variable Groups:** Variáveis definidas em Variable Groups do Azure Pipelines têm pontos e hifens removidos (ex: `Berean.Model` vira `BEREAN_MODEL`, `BereanModel` vira `BEREANMODEL`). O Berean aceita ambos os formatos automaticamente.

---

## Comandos

### `berean auth`

Gerencia autenticação com GitHub Copilot.

```bash
berean auth login    # Autenticar via Copilot CLI
berean auth logout   # Sair e remover tokens
berean auth status   # Verificar status da autenticação
```

#### Métodos de Autenticação

| Método | Como configurar | Uso |
|--------|----------------|-----|
| **Env var** (casos suportados em CI/CD) | `export GITHUB_TOKEN="..."` | So funciona quando o token consegue trocar por token do Copilot |
| **Copilot CLI** (recomendado para dev) | `berean auth login` | Login interativo no navegador |

---

### `berean models`

Lista e gerencia modelos de IA.

```bash
berean models list      # Lista todos os modelos disponíveis
berean models select    # Seleciona um modelo interativamente
berean models set <id>  # Define modelo padrão pelo ID
berean models current   # Mostra modelo padrão atual
```

**Definir via env var:**

```bash
export BEREAN_MODEL="claude-sonnet-4"
```

#### Modelos Disponíveis

| Modelo | Descrição |
|--------|-----------|
| `gpt-4o` | Mais capaz (padrão) |
| `gpt-4o-mini` | Rápido e eficiente |
| `claude-sonnet-4` | Anthropic Claude Sonnet 4 |
| `claude-3.5-sonnet` | Anthropic Claude 3.5 Sonnet |
| `gemini-2.0-flash` | Google Gemini 2.0 Flash |
| `o3-mini` | OpenAI o3-mini (raciocínio rápido) |

---

### `berean review`

Revisa um Pull Request.

```bash
berean review <url> [opções]
```

#### Uso Básico

```bash
# Revisar por URL (GitHub)
berean review https://github.com/owner/repo/pull/123

# Revisar por URL (Azure DevOps)
berean review https://dev.azure.com/org/project/_git/repo/pullrequest/123

# Revisar com parâmetros explícitos (GitHub)
berean review --owner myowner --repo myrepo --pr 123

# Revisar com parâmetros explícitos (Azure DevOps)
berean review --org myorg --project myproj --repo myrepo --pr 123
```

#### Opções

| Opção | Descrição |
|-------|-----------|
| `--owner <owner>` | Dono do repositório GitHub |
| `--org <organization>` | Organização do Azure DevOps |
| `--project <project>` | Projeto do Azure DevOps |
| `--repo <repository>` | Nome do repositório |
| `--pr <id>` | ID do Pull Request |
| `--model <model>` | Modelo de IA (override do BEREAN_MODEL/config) |
| `--language <lang>` | Idioma das respostas (override do BEREAN_LANGUAGE/config) |
| `--json` | Saída em JSON |
| `--list-models` | Lista modelos de IA disponíveis |
| `--post-comment` | Posta review como comentário no PR |
| `--inline` | Posta comentários inline em linhas específicas |
| `--skip-if-reviewed` | Pula se o PR já foi revisado; quando houver novos commits, revisa apenas esses commits |
| `--incremental` | Revisa apenas novos commits desde a última review |
| `--force` | Força review mesmo se `@berean: ignore` estiver definido |

#### Exemplos

```bash
# Usar um modelo específico
berean review <url> --model claude-sonnet-4

# Revisar em Português
berean review <url> --language "Português do Brasil"

# Postar review como comentário no PR
berean review <url> --post-comment

# Postar comentários inline em linhas específicas
berean review <url> --inline

# Ambos: comentário geral + comentários inline
berean review <url> --post-comment --inline

# CI/CD: Pular se já revisado
berean review <url> --post-comment --skip-if-reviewed

# CI/CD: Review incremental (atualiza comentário existente)
berean review <url> --post-comment --incremental
```

---

### `berean config`

Gerencia configurações salvas em `~/.berean/config.json`.

```bash
berean config set <key> <value>   # Define um valor
berean config get [key]           # Obtém valor(es)
berean config path                # Mostra caminho do diretório de config
```

#### Chaves de Configuração

| Chave | Descrição | Env var equivalente |
|-------|-----------|---------------------|
| `azure-pat` | PAT do Azure DevOps | `AZURE_DEVOPS_PAT` |
| `default-model` | Modelo de IA padrão | `BEREAN_MODEL` |
| `fallback-model` | Modelo usado quando o principal falhar | `BEREAN_FALLBACK_MODEL` |
| `language` | Idioma das respostas | `BEREAN_LANGUAGE` |
| `max-rules-chars` | Máximo de caracteres para regras | `BEREAN_MAX_RULES_CHARS` |
| `ollama-endpoint` | URL do servidor Ollama | `BEREAN_OLLAMA_ENDPOINT` |
| `ollama-model` | Modelo Ollama padrão | `BEREAN_OLLAMA_MODEL` |

**Exemplo:**

```bash
berean config set fallback-model copilot:gpt-4o
berean config set ollama-endpoint http://localhost:11434
berean config set max-rules-chars 50000
```

---

### `berean update`

```bash
berean update          # Atualiza para a versão mais recente
berean update --check  # Apenas verifica se há atualizações
```

---

## Integração CI/CD

### GitHub Actions (para PRs do GitHub)

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

      - name: Instalar Copilot CLI e Berean
        run: |
          npm install -g @github/copilot
          curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash
          echo "$(npm prefix -g)/bin" >> $GITHUB_PATH

      - name: Executar AI Review
        run: |
          berean review "https://github.com/${{ github.repository }}/pull/${{ github.event.pull_request.number }}" \
            --post-comment --inline --skip-if-reviewed
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BEREAN_MODEL: gpt-4o
          BEREAN_LANGUAGE: Português do Brasil
```

### Azure Pipelines (para PRs do Azure DevOps)

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
    displayName: 'Instalar Copilot CLI e Berean'

  - script: |
      PR_URL="https://dev.azure.com/$(System.CollectionUri)/$(System.TeamProject)/_git/$(Build.Repository.Name)/pullrequest/$(System.PullRequest.PullRequestId)"
      berean review "$PR_URL" --post-comment --inline --skip-if-reviewed
    displayName: 'Executar AI Code Review'
    env:
      GITHUB_TOKEN: $(GithubToken)
      AZURE_DEVOPS_PAT: $(System.AccessToken)
      BEREAN_MODEL: claude-sonnet-4
      BEREAN_LANGUAGE: Português do Brasil
```

### Variáveis no Azure DevOps

Para configurar as variáveis no Azure Pipelines:

1. Vá em **Pipelines** → **Library** → **Variable Groups** (ou direto no pipeline)
2. Adicione as variáveis:

| Variável | Valor | Segredo? |
|----------|-------|----------|
| `GithubToken` | Seu GitHub PAT (`ghp_xxx`) ou token OAuth | ✅ Sim |
| `BEREAN_MODEL` | `gpt-4o` ou `claude-sonnet-4` etc. | Não |
| `BEREAN_LANGUAGE` | `Português do Brasil` | Não |

> **Nota:** `AZURE_DEVOPS_PAT` pode usar `$(System.AccessToken)` que é o token automático do pipeline. Certifique-se de que o Build Service tem permissão de **Contribute to pull requests** no repositório.

#### Permissões do PAT do Azure DevOps

Se usar um PAT manual ao invés do `System.AccessToken`:

| Escopo | Permissão |
|--------|-----------|
| **Code** | Read |
| **Pull Request Threads** | Read & Write |

#### Token do GitHub

Opções para o token GitHub:

1. **GitHub PAT (Fine-grained)** - Crie em github.com → Settings → Developer settings → Fine-grained tokens
   - Para PRs do GitHub: precisa de permissão de leitura no repositório e escrita em Pull Requests
   - Para apenas usar o Copilot (PRs Azure): não precisa de escopo de repositório

2. **GitHub PAT (Classic)** - `ghp_` prefix
   - Para PRs do GitHub: escopo `repo` (ou pelo menos `public_repo` para repos públicos)
   - Para apenas usar o Copilot (PRs Azure): escopo mínimo nenhum

3. **OAuth token** - `gho_` ou `ghu_` prefix (de um GitHub App)

### GitHub Actions (para PRs do Azure DevOps)

```yaml
name: AI Code Review

on:
  workflow_dispatch:
    inputs:
      pr_url:
        description: 'URL do PR no Azure DevOps'
        required: true

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Instalar Copilot CLI e Berean
        run: |
          npm install -g @github/copilot
          curl -fsSL https://raw.githubusercontent.com/iatecbr/IATec.AI.WorkFlow.Review.Berean/main/install.sh | bash
          echo "$(npm prefix -g)/bin" >> $GITHUB_PATH

      - name: Executar AI Review
        run: berean review "${{ inputs.pr_url }}" --post-comment --inline
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
          BEREAN_MODEL: gpt-4o
          BEREAN_LANGUAGE: Português do Brasil
```

### Azure Pipelines (para PRs do GitHub)

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
    displayName: 'Instalar Copilot CLI e Berean'

  - script: |
      berean review "https://github.com/owner/repo/pull/$(System.PullRequest.PullRequestNumber)" \
        --post-comment --inline --skip-if-reviewed
    displayName: 'Executar AI Code Review'
    env:
      GITHUB_TOKEN: $(GithubToken)
      BEREAN_MODEL: claude-sonnet-4
      BEREAN_LANGUAGE: Português do Brasil
```

---

## Provedor Ollama

O Berean suporta inferência local via [Ollama](https://ollama.com/), sem necessidade de credenciais de cloud.

### Configuração

1. Instale e inicie o Ollama: https://ollama.com/download
2. Baixe um modelo: `ollama pull llama3.2`
3. Configure o Berean:

```bash
# Via variáveis de ambiente
export BEREAN_OLLAMA_ENDPOINT="http://localhost:11434"
export BEREAN_OLLAMA_MODEL="llama3.2"  # opcional — pode usar o prefixo do modelo

# Ou via config
berean config set ollama-endpoint http://localhost:11434
berean config set ollama-model llama3.2
```

### Usando Modelos Ollama

Prefixe qualquer nome de modelo com `ollama:` para rotear ao Ollama local:

```bash
berean review <url> --model ollama:llama3.2
berean review <url> --model ollama:gemma4:12b
berean review <url> --model ollama:qwen2.5-coder:14b
```

Definir `BEREAN_DEFAULT_MODEL` com o prefixo `ollama:` também funciona:

```bash
export BEREAN_DEFAULT_MODEL="ollama:llama3.2"
berean review <url>
```

### Ollama com Endpoint Protegido

Se o seu Ollama requer autenticação:

```bash
export BEREAN_OLLAMA_ENDPOINT="https://meu-ollama.exemplo.com"
export BEREAN_OLLAMA_API_KEY="minha-chave"
```

---

## Modelo Fallback

Quando o provedor/modelo principal falha (HTTP 401, 429, erro de rede, etc.), o Berean tenta automaticamente com um fallback configurado.

### Configuração

```bash
# Via variável de ambiente
export BEREAN_FALLBACK_MODEL="copilot:gpt-4o"

# Ou via arquivo de config
berean config set fallback-model copilot:gpt-4o
```

### Exemplos

```bash
# Usar Ollama como principal e GitHub Copilot como fallback
export BEREAN_DEFAULT_MODEL="ollama:llama3.2"
export BEREAN_FALLBACK_MODEL="copilot:gpt-4o"
berean review <url>

# Usar Copilot como principal e Ollama local como fallback
export BEREAN_DEFAULT_MODEL="copilot:gpt-4o"
export BEREAN_FALLBACK_MODEL="ollama:llama3.2"
berean review <url>
```

Quando o fallback é acionado, um evento de progresso é emitido:

```
Primary model failed (HTTP 401: "unauthorized"). Retrying with fallback model "gpt-4o"...
```

---

## Proteção Anti-Loop

### Palavra-chave de Ignorar

Adicione `@berean: ignore` na descrição do PR para pular a review:

```markdown
Este PR refatora o módulo de pagamentos.

@berean: ignore
```

Use `--force` para ignorar isso e revisar mesmo assim.

### Pular se Já Revisado

```bash
berean review <url> --post-comment --skip-if-reviewed
```

Quando houver novos commits depois da última review, apenas esses commits entram no novo escopo de revisão.

### Reviews Incrementais

```bash
berean review <url> --post-comment --incremental
```

---

## Saída da Review

### Níveis de Severidade

| Nível | Ícone | Descrição |
|-------|-------|-----------|
| `critical` | 🔴 | Vulnerabilidades de segurança, bugs que causam crashes, perda de dados |
| `warning` | 🟡 | Code smells, bugs potenciais, problemas de performance |
| `suggestion` | 🔵 | Melhorias de estilo, oportunidades de refatoração |

### Saída JSON

```bash
berean review <url> --json
```

```json
{
  "success": true,
  "summary": "Implementação de métodos de pagamento...",
  "issues": [
    {
      "severity": "critical",
      "file": "/src/payment.ts",
      "line": 42,
      "message": "Vulnerabilidade de SQL injection",
      "suggestion": "Use consultas parametrizadas"
    }
  ],
  "positives": ["Bom uso de tipos TypeScript"],
  "recommendations": ["Considere adicionar testes unitários"]
}
```

---

## Solução de Problemas

### Problemas de Autenticação

```bash
# Verificar status
berean auth status

# Re-autenticar
berean auth logout
berean auth login
```

### Copilot CLI não encontrado

```bash
npm install -g @github/copilot
copilot --version
```

### Token Expirado (CI/CD)

Verifique se o token GitHub ainda é válido:

```bash
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

---

## Licença

MIT

---

*Gerado com ❤️ por [Berean](https://github.com/iatecbr/IATec.AI.WorkFlow.Review.Berean) 🔍*
