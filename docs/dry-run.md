# DRY_RUN local isolado

O modo anterior navegava no Chrome autenticado e dependia de o modelo obedecer a `confirmar_envio`. Foi substituído, no bootstrap, por uma simulação local em processo filho. Não há agente LLM nem browser nesse processo e nenhuma ação do cenário é encaminhada a MCP, JavaScript, shell ou HTTP.

## Execução

Use o runtime Node/npm definido no PR-01:

```powershell
npm start
# Ou a versão compilada:
npm run build
npm run start:built
```

Não precisa de `.env`, chave de API, Chrome ou sessão autenticada. `DRY_RUN` ausente significa `true`; `DRY_RUN=false` e `LIVE_SUBMISSION_ENABLED=true` continuam rejeitados.

O cenário `config/dry-run.example.json` contém perfil técnico e vagas sintéticas editáveis. O simulador reutiliza o scoring existente, grava somente status `dry-run` em `data/simulacoes.db` e imprime um resumo local. Não lê o perfil pessoal nem modifica `data/candidaturas.db`. Execuções repetidas preservam a unicidade dos IDs no banco da simulação.

`acoes` permite exercitar tentativas de ferramentas: apenas `pontuar_vaga` faz cálculo local; `confirmar_envio` e qualquer outra ferramenta são recusadas. Click, Enter, upload, navegação, request HTTP e execução de código não são simulados por um browser real. Códigos retornados: `DRY_RUN_ENVIO_BLOQUEADO` e `DRY_RUN_CAPACIDADE_INDISPONIVEL`.

Mesmo configurados, Telegram, SMTP, providers LLM, CDP e cron não são iniciados nessa rota. `CRON_ATIVO=true` ainda resulta em uma simulação única, que encerra. O processo filho recebe apenas variáveis básicas de execução do Windows/Node, sem chaves de API, `NODE_OPTIONS` ou configuração de notificações.

## Barreiras no código

- `index.ts` seleciona a simulação antes de configurar providers, cron, notificações ou browser.
- `dry-run-worker.ts` importa apenas o motor local e SQLite. Não recebe configuração de envio.
- `executarAgente` recusa `dryRun=true` antes de criar cliente LLM ou executar ferramentas.
- `construirConfigGeracao` não expõe ferramentas por padrão em dry-run.
- `conectarPlaywrightMCP` recusa conexão por padrão; o smoke de inventário usa opt-in explícito e não abre browser.
- O executor legado recusa ferramentas fora da allowlist local em dry-run e não notifica candidaturas simuladas.

O cenário é validado em runtime, com limites de quantidade e tamanho de texto. Descrições maliciosas são dados de scoring; não existem interpretações de código ou instruções do modelo. O processo separado não é uma sandbox de sistema operacional: a proteção vem da ausência do modelo/browser e da rota sem execução arbitrária. Alterar código, dependências ou iniciar manualmente ferramentas fora do programa não faz parte dessa garantia de funcionamento.

## Validação

`tests/dry-run.test.ts` verifica recusa de ferramentas, configuração sem credenciais, dados inválidos e tentativas de contornar o modo por agente/MCP. Um servidor independente em loopback conta todas as requisições e POSTs enquanto o processo filho recebe pedidos de clique, Enter, submit/requestSubmit, upload, HTTP e código arbitrário. O mesmo teste executa o bootstrap com CDP/LLM/SMTP apontados ao servidor e segredos sentinela: exige zero requisições e ausência dos segredos na saída.

O banco temporário é consultado diretamente para confirmar status somente `dry-run`. Os testes não usam contas ou portais reais. A execução em processo filho pode exigir permissão fora do sandbox do executor no Windows; uma falha ao iniciar encerra a simulação sem fallback para o agente real.

Resultado no Windows com Node 24.22.1: a suíte atual tem **136 testes em 17 arquivos**, incluindo os 3 testes novos do domínio supervisionado. Os 26 testes específicos de DRY_RUN passaram; o servidor independente registrou zero requisições e zero POSTs nos testes adversariais.

Lint, typecheck, build e `git diff --check` passaram. A versão compilada (`node dist/index.js`) foi executada sem chave e encerrou com código 0, registrando uma vaga sintética elegível, descartando a incompatível e recusando todas as ações externas do cenário. O banco pessoal não foi utilizado. Nenhum commit/push foi criado; as alterações permanecem na branch `pr-01-estabilizacao`.

## Limite funcional

Essa rota não valida páginas reais, preenchimento de formulário, autosave ou fluxo de submissão. Ela não é o Reader/Preparer nem o SubmissionGateway completo da SPEC e não habilita produção. Para simular dentro de um browser real ou habilitar live, ainda serão necessários os adaptadores restritos, políticas, autorizações e gateway do PR-04. Nenhuma candidatura real, commit ou push é autorizado por esta correção.
