# PR-01 — Ambiente reproduzível e baseline local

Este relatório registra o baseline original de 107 testes. A correção posterior de DRY_RUN mudou o bootstrap para simulação local sem credenciais/browser: veja [comportamento atual e validação](dry-run.md). As observações de checkpoint cooperativo abaixo se referem ao legado, não à nova rota de simulação.

Branch: `pr-01-estabilizacao`. Base: `6dd9a5526fa3a771826cc59a565a238c938c3f4f`.

Referências: [auditoria](diagnostico-java-pleno.md), [SPEC-001](specs/SPEC-001-supervised-autonomous.md), [ADR de isolamento](adr/0001-isolamento-submissao.md) e [inventário MCP](mcp-capabilities.json).

## Instalação Windows

Recomendado: Node **24.22.1 LTS**, npm **11.19.1**, Windows x64 e Google Chrome. Versões fixadas em `.nvmrc`/`packageManager`; faixa de runtimes em `engines`. Node 26.3.0 da auditoria está fora da faixa, inclusive por atualização de segurança do runtime. Nenhum Node global foi alterado durante a implementação.

Se usar nvm-windows, instale/selecione `24.22.1` pela ferramenta. Alternativamente use o instalador oficial do Node. Comandos PowerShell, na raiz do projeto:

```powershell
node --version
npm --version
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:run
npm run test:smoke
npm audit
```

Não usar `npm ci --ignore-scripts` como solução de instalação. `better-sqlite3@13.0.3` inclui os binários; `allowScripts` controla scripts de dependências, permitindo esbuild/protobufjs e negando a compilação automática desnecessária do SQLite. Os testes de integração verificam o binding nativo real. O MCP está no lockfile e não é baixado ao iniciar o agente.

O smoke exige Chrome. Se não estiver em um caminho padrão, defina somente para a sessão:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:smoke
```

O teste de PDF usa Chrome headless e pode precisar de permissão para criar processos fora de um sandbox do executor. Não desabilite a sandbox do Chrome para contornar essa restrição. Os testes comuns não precisam de `.env`, chaves, login, Telegram ou SMTP. O handshake MCP só lista ferramentas, sem abrir browser; HTTP é limitado a loopback. O browser do PDF usa fixture sem recursos externos, não o perfil pessoal.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm ci` | Instalação exata pelo lockfile |
| `npm run lint` | ESLint com regras recomendadas TypeScript em código, testes e config Vitest |
| `npm run typecheck` | Tipos de código, testes e fixtures TypeScript, sem emissão |
| `npm run build` | Gera ESM/declarations em `dist/` |
| `npm run test:run` | Suíte completa sem portais reais, incluindo smoke Chrome |
| `npm run test:smoke` | SQLite, processo MCP, HTTP local sem POST e PDF real |
| `npm test` | Vitest em modo interativo |
| `npm run chrome` | Abre about:blank em perfil dedicado `.auto-apply-chrome`, CDP loopback |
| `npm start` / `npm run dev` | Bootstrap TypeScript / watch; conecta ao agente legado se configurado |
| `npm run start:built` | Mesmo bootstrap a partir de `dist/`, depois do build |
| `npm run resultado -- <id> <resultado>` | Atualização manual do desfecho no banco legado |

Não executar `npm start`, `dev` ou `start:built` com portais/contas reais nesta etapa. O modo simulado não impõe isolamento técnico das ferramentas de escrita.

Configuração pessoal futura, sem sobrescrever arquivos existentes:

```powershell
Copy-Item .env.example .env
Copy-Item config/perfil.example.json config/perfil.json
Copy-Item config/curriculos.example.json config/curriculos.json
Copy-Item config/respostas.example.json config/respostas.json
```

Os exemplos são sintéticos, não perfis prontos para candidatura. Nunca versionar os arquivos pessoais, `.env`, perfis Chrome, PDFs, screenshots ou logs. `CHROME_PATH` no `.env` é carregado pelos comandos de aplicação; em testes, use variável de sessão.

## Variáveis implementadas

`validarEnv` aceita ambiente injetado para testes; valida flags, números finitos/faixas, horário e URLs sem credenciais. Erros citam o nome da variável, sem reproduzir o valor informado.

| Variável | Padrão / validação |
| --- | --- |
| `GEMINI_API_KEY` | Obrigatória no bootstrap do agente; desnecessária para build/lint/testes |
| `GEMINI_MODEL` | `gemini-2.5-flash`; disponibilidade depende da conta/provedor |
| `EXECUTION_MODE` | `SUPERVISED_AUTONOMOUS`; também aceita `ASSISTED`. Rótulo validado, não implementa ainda a nova orquestração |
| `DRY_RUN` | `true`; PR-01 rejeita `false` e valores diferentes de true/false |
| `LIVE_SUBMISSION_ENABLED` | `false`; PR-01 rejeita `true`. Não é um gateway |
| `CDP_ENDPOINT` | `http://127.0.0.1:9222`; URL HTTP(S) sem credenciais; launcher exige HTTP e IP loopback explícito |
| `CHROME_PATH` | Opcional; caminho do executável Chrome existente; detecção Windows/Linux/macOS quando ausente |
| `LIMITE_DIARIO` | `10`; inteiro >=1, legado preservado |
| `MAX_POR_EXECUCAO` | `5`; inteiro >=1, legado preservado |
| `DELAY_MIN` | `2000`; inteiro >=0 em ms |
| `DELAY_MAX` | `5000`; inteiro >= DELAY_MIN em ms |
| `SCORE_MINIMO` | `6`; inteiro 1–10, scoring legado preservado |
| `CUSTO_MAX_USD` | `0`; número finito >=0; zero desliga o teto legado, aproximado e pós-chamada |
| `DASHBOARD_PORT` | `3000`; inteiro 1–65535, bind loopback |
| `CRON_ATIVO` | `false`; somente true/false |
| `CRON_HORARIO` | `09:00`; formato HH:MM válido, usa timezone do processo no legado |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Vazios; sem configuração não há notificações |
| `SMTP_HOST` | Vazio no código; exemplo usa `smtp.gmail.com` |
| `SMTP_PORT` | `587`; inteiro 1–65535; 465 usa TLS implícito |
| `SMTP_USER`, `SMTP_PASS`, `EMAIL_DESTINATARIO` | Vazios; envio de email só com configuração completa |
| `LLM_AUX_PROVIDER` | `gemini`; alternativas `ollama`, `openai` |
| `LLM_AUX_MODEL` | `LLM_AUX_MODEL`, senão `GEMINI_MODEL`, senão `gemini-2.5-flash`; escolher modelo compatível com provider |
| `OLLAMA_URL` | `http://localhost:11434`; HTTP(S) sem credenciais |
| `OPENAI_API_KEY` | Vazia; usada somente pelo provider auxiliar OpenAI-compatible |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1`; HTTP(S) sem credenciais |

Não foi implementada migração do agente principal para OpenAI. O orçamento, o masking de PII e a proteção contra conteúdo malicioso permanecem com os limites documentados na auditoria.

Outras flags da SPEC (`MAX_PENDING_REVIEW`, `MAX_LLM_COST_USD_PER_RUN`, `SUBMISSION_GATEWAY_ENABLED`, `TELEGRAM_NOTIFICATIONS`, `TIMEZONE`) **não são controles ativos no PR-01**. Não as copie supondo que habilitam gateway, fila ou orçamento rígido. Serão conectadas a contratos e validadores nos respectivos PRs. Os limites 5/dia, 3/run e score 8 sugeridos na SPEC não substituíram silenciosamente os defaults legados nesta estabilização.

## Problemas corrigidos e alcance

- Binding SQLite passa a ser distribuído com a dependência, sem compilação local para Windows x64 validado.
- Dependências diretas vulneráveis atualizadas, transitivas corrigidas pelo lockfile; MCP local fixado em vez de npx dinâmico.
- Build e lint reais adicionados; typecheck abrange testes.
- Configuração extraída do entrypoint e validada, simulação por padrão e ativação de live recusada.
- Chrome/PDF detectado no Windows, `CHROME_PATH` opcional, URL `file:` correta para espaços/acentos/#, perfil temporário isolado, sandbox padrão e validação da assinatura PDF; falha não retorna documento antigo.
- `npm run chrome` passa a funcionar com executável Windows e perfil dedicado.
- Testes de banco usam diretório exclusivo, evitando colisão entre execuções concorrentes.
- Recursos de teste são fechados; o baseline final verifica também o encerramento sem aviso de processo pendente.
- SPEC preservada em `docs/specs`, ADR e inventário das 23 capabilities disponíveis adicionados.

Não foram alterados algoritmo de matching, conteúdo factual do currículo, tabelas de domínio, deduplicação, policies ou fluxo de aprovação. Essas correções pertencem aos próximos PRs.

## Evidências e próximos passos

Validação executada em Windows x64 com Node 24.22.1 portátil (SHA256 verificado contra o manifesto oficial) e npm 11.19.1. O runtime portátil está em `.audit-cache/runtime/node-v24.22.1-win-x64/`, ignorado pelo Git; o Node global não foi substituído.

| Verificação executada | Resultado |
| --- | --- |
| `npm ci --no-fund --cache .audit-cache/npm` | Passou sem `--ignore-scripts`; 312 pacotes instalados |
| `npm run lint` | Passou, zero erros |
| `npm run typecheck` | Passou, incluindo testes |
| `npm run build` | Passou |
| `npm run test:run` | 107 testes em 15 arquivos passaram; zero skips/falhas, sem aviso de processo pendente |
| `npm run test:smoke` | 4 testes passaram; também repetidos dentro da suite completa |
| `npm audit --json --cache .audit-cache/npm` | Zero alertas de todas as severidades no lockfile final |
| `node dist/index.js` sem chave e com dotenv apontado para arquivo inexistente | Exit 1 com erro de configuração, antes de conectar browser/LLM |
| `git diff --check` | Passou |

O Chrome headless precisou de execução fora do sandbox do agente. O smoke isolado passou inicialmente com Node 26.3.0, e a suite final completa com Node 24.22.1. O runtime 26.3.0 continua fora da faixa suportada e não é recomendado; Node 26.12.1 não foi validado nesta máquina.

Para reproduzir com o runtime portátil já presente, sem mudar o sistema:

```powershell
$runtimePath = Join-Path (Get-Location) '.audit-cache\runtime\node-v24.22.1-win-x64'
$env:PATH = $runtimePath + ';' + $env:PATH
$env:DRY_RUN = 'true'
$env:LIVE_SUBMISSION_ENABLED = 'false'
npm ci
npm run lint
npm run typecheck
npm run build
npm run test:run
```

O download do runtime não integra o repositório; em outra máquina instale a versão indicada em `.nvmrc`. Warnings de depreciação de `node-domexception` e `glob` ainda aparecem na instalação, embora `npm audit` retorne zero alertas. Não foram suprimidos.

Arquivos alterados: `.env.example`, `.gitignore`, `README.md`, `package.json`, `package-lock.json`, `src/index.ts`, `src/mcp-client.ts`, `src/curriculo-tailored.ts`, `tests/database.test.ts`.

Arquivos adicionados: `.nvmrc`, `eslint.config.mjs`, `tsconfig.check.json`, `src/config.ts`, `src/chrome.ts`, `src/abrir-chrome.ts`, `tests/config.test.ts`, `tests/chrome.test.ts`, `tests/smoke.test.ts`, `tests/fixtures/curriculo-local.html`, `tests/fixtures/portal-local.html`, este guia, `docs/adr/0001-isolamento-submissao.md`, `docs/mcp-capabilities.json` e `docs/specs/SPEC-001-supervised-autonomous.md`. A auditoria e a SPEC original fornecida pelo usuário foram preservadas.

Para iniciar PR-02: usar os contratos da SPEC-001, adicionar máquina de estados e migrações versionadas em SQLite preservando o histórico legado; testar transições, unicidade e concorrência com bancos temporários. Não ativar live após merge do PR-01/02. Gateway/capabilities só serão aceitos no PR-04 após testes adversariais locais.

Pendentes: validação em outras máquinas/SOs, integridade visual de currículos reais, envio de email/Telegram, integração paga de LLM, isolamento do browser, autorização, privacidade/proveniência e piloto de portais. Nenhum desses itens é atestado pelo smoke.

Rollback e riscos de submissão: [ADR 0001](adr/0001-isolamento-submissao.md). Nenhum dado pessoal ou banco de produção foi migrado; nenhum commit/push foi realizado.
