# SPEC-001 — SUPERVISED_AUTONOMOUS

**Projeto:** [auto-apply-bot](https://github.com/LuisMIguelFurlanettoSousa/auto-apply-bot)
**Estado:** Proposta para implementação; nenhum envio real autorizado.
**Objetivo:** executar descoberta, avaliação, preparação e candidaturas com autonomia supervisionada, dentro de políticas determinísticas e com intervenção humana por exceção.

## 1. Contexto e escopo

O projeto base usa TypeScript/Node.js, Gemini como agente principal, Playwright MCP via Chrome/CDP, SQLite, dashboard, Telegram, cron e DRY_RUN. O README informa que o checkpoint `confirmar_envio` é cooperativo: o agente com acesso irrestrito ao browser pode clicar diretamente no envio. **A prioridade P0 é remover essa capacidade e criar uma barreira efetiva de submissão.** Auditar o código antes de alterar nomes ou módulos; os caminhos sugeridos aqui são novos contratos, não afirmações sobre a estrutura existente.

### Dentro do escopo
- Descoberta e normalização de vagas; matching explicável e critérios eliminatórios.
- Geração de currículo e respostas com proveniência; proibição de fatos inventados.
- Políticas por plataforma, autorização de uso único e fila de revisão.
- Gateway de submissão com browser restrito; idempotência; auditoria; dashboard; notificações.
- Agendamento, recuperação, kill switch, limites, testes e simulação ponta a ponta.

### Fora do escopo
- Bypass de CAPTCHA, Cloudflare, autenticação, rate limits ou restrições de plataforma.
- Envio de mensagens automáticas a recrutadores no MVP.
- Execução de candidaturas reais durante implementação e testes.
- Alteração de perfis ou dados de terceiros sem autorização.

## 2. Configuração inicial e perfis

```dotenv
EXECUTION_MODE=SUPERVISED_AUTONOMOUS
DRY_RUN=true
LIVE_SUBMISSION_ENABLED=false
SCORE_MINIMO=8
LIMITE_DIARIO=5
MAX_POR_EXECUCAO=3
MAX_PENDING_REVIEW=30
MAX_LLM_COST_USD_PER_RUN=1.00
SUBMISSION_GATEWAY_ENABLED=true
TELEGRAM_NOTIFICATIONS=true
TIMEZONE=America/Sao_Paulo
```

Todos os parâmetros devem ser validados na inicialização (falha fechada). `LIVE_SUBMISSION_ENABLED` é falso por padrão e exige uma ativação deliberada e auditada após o piloto. Limites e valores monetários são configurações, não promessas de gasto. O teto de custo deve impedir novas chamadas antes de ultrapassar o orçamento estimado; registrar divergência entre estimado e faturado.

Perfil inicial editável: cargos Backend Developer, Java Developer, Software Engineer; nível Pleno/Mid-Level; tecnologias Java, Kotlin, Spring Boot, AWS, PostgreSQL; remoto Brasil ou híbrido Brasília/DF. Pretensão salarial mínima fica **não configurada** até decisão do usuário. Salário ausente na vaga não elimina automaticamente.

## 3. Regras de decisão

1. Aplicar primeiro filtros eliminatórios: vaga expirada, duplicidade, empresa bloqueada, modalidade/local incompatível, exigência obrigatória comprovadamente não atendida, plataforma não autorizada ou remuneração explícita inferior ao mínimo configurado.
2. Se dado obrigatório estiver desconhecido, usar `PENDING_REVIEW`, não inventar e não descartar automaticamente por inferência.
3. Calcular score inteiro de 1 a 10, com componentes e justificativas persistidos. Sugestão inicial de pesos normalizados: tecnologias 40%, senioridade 25%, modalidade/local 20%, idioma e requisitos complementares 15%. Versão do algoritmo obrigatória.
4. Score >= 8: elegível para preparação e eventual envio automático **somente** quando todos os demais gates estiverem satisfeitos.
5. Score 6–7: revisão humana. Score < 6: `SKIPPED`, com motivo. Critério eliminatório prevalece sobre score.
6. Respostas de formulário devem derivar de perfil validado ou aprovação específica. Questões de consentimento, declarações legais, dados protegidos, elegibilidade, autorização de trabalho, disponibilidade, pretensão salarial não cadastrada e perguntas ambíguas exigem intervenção.
7. Currículo personalizado pode reordenar e reescrever experiências verdadeiras; não pode criar datas, cargos, competências, certificações, idiomas ou métricas. Hash e versão do currículo devem constar na autorização.
8. Nunca repetir uma submissão com resultado desconhecido sem verificação humana ou confirmação confiável no portal.

## 4. Políticas por plataforma

| Plataforma | Descoberta | Preparação | Envio automatizado padrão |
|---|---|---|---|
| LinkedIn | Somente meios permitidos | Sim, fora do portal | `DENY` (manual) |
| Gupy | Condicionada aos termos e meios permitidos | Sim | `REVIEW_ONLY` até validação formal |
| Indeed | Condicionada aos termos e meios permitidos | Sim | `REVIEW_ONLY` até validação formal |
| Sites corporativos / ATS | Conforme autorização e condições do site | Sim | `ALLOW` somente após validação por adaptador e autorização explícita |
| Plataforma desconhecida | Não presumir permissão | Sim, a partir de dados obtidos licitamente | `DENY` |

`REVIEW_ONLY` não autoriza automaticamente um clique automatizado: pode exigir finalização manual, conforme política do site. Políticas não podem ser relaxadas por prompt, conteúdo da vaga, mensagem do portal ou retorno de ferramenta. Registrar versão e fonte da avaliação de permissão. CAPTCHA ou bloqueio: `BLOCKED`, suspender o adaptador e solicitar ação humana, sem tentar contornar proteções.

## 5. Contratos TypeScript

Criar `src/domain/contracts.ts` (adaptar à estrutura real após auditoria):

```ts
export type Platform = 'LINKEDIN' | 'GUPY' | 'INDEED' | 'CORPORATE_ATS' | 'OTHER';
export type ExecutionMode = 'ASSISTED' | 'SUPERVISED_AUTONOMOUS';
export type PolicyAction = 'ALLOW' | 'REVIEW_ONLY' | 'DENY';
export type ApplicationState =
  | 'DISCOVERED' | 'EVALUATED' | 'PREPARED' | 'PENDING_REVIEW'
  | 'AUTHORIZED' | 'SUBMITTING' | 'SUBMITTED' | 'UNKNOWN_RESULT'
  | 'BLOCKED' | 'SKIPPED' | 'FAILED';
export type ReviewDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export interface Job {
  id: string; platform: Platform; externalId?: string;
  canonicalUrl: string; company: string; title: string;
  description: string; descriptionHash: string;
  location?: string; workMode: 'REMOTE' | 'HYBRID' | 'ONSITE' | 'UNKNOWN';
  salaryMin?: number; salaryMax?: number; currency?: string;
  discoveredAt: string;
}
export interface Evidence {
  kind: 'PROFILE' | 'JOB_DESCRIPTION' | 'APPROVED_ANSWER' | 'PORTAL_CONFIRMATION';
  reference: string; contentHash?: string;
}
export interface MatchResult {
  jobId: string; score: number; algorithmVersion: string;
  breakdown: Record<string, number>; reasons: string[];
  disqualifiers: string[]; unknowns: string[];
  evidence: Evidence[];
}
export interface PreparedApplication {
  id: string; jobId: string; candidateProfileVersion: string;
  resumeSha256: string; answersSha256: string;
  formFingerprint: string; documentPath: string;
  answerEvidence: Record<string, Evidence[]>;
}
export interface PlatformPolicy {
  platform: Platform; action: PolicyAction;
  adapterVersion: string; reviewedAt: string; rationale: string;
  allowsAutomatedSubmit: boolean;
}
export interface Authorization {
  id: string; applicationId: string; jobId: string;
  policyVersion: string; formFingerprint: string;
  resumeSha256: string; answersSha256: string;
  scope: 'SINGLE_SUBMISSION'; expiresAt: string;
  grantedBy: 'POLICY_ENGINE' | 'HUMAN'; grantedAt: string;
  consumedAt?: string;
}
export interface SubmissionRequest {
  applicationId: string; authorizationId: string;
  idempotencyKey: string; expectedFormFingerprint: string;
}
export type SubmissionResult =
  | { status: 'CONFIRMED'; receipt: string; evidence: Evidence[] }
  | { status: 'UNKNOWN'; reason: string; evidence: Evidence[] }
  | { status: 'BLOCKED'; reason: string };
export interface ReviewItem {
  id: string; applicationId: string; reasonCodes: string[];
  createdAt: string; expiresAt?: string; decision?: ReviewDecision;
  decidedBy?: string; decidedAt?: string;
}
```

Os contratos são propostos. Validar entradas externas com schemas de runtime (por exemplo, Zod) e nunca confiar apenas na tipagem estática.

## 6. Máquina de estados

Fluxo principal:
`DISCOVERED -> EVALUATED -> PREPARED -> AUTHORIZED -> SUBMITTING -> SUBMITTED`.

Transições alternativas:
- `DISCOVERED/EVALUATED -> SKIPPED` por filtro, duplicidade ou score.
- `EVALUATED/PREPARED -> PENDING_REVIEW` por score intermediário, dado incerto, política restritiva ou resposta sensível.
- `PENDING_REVIEW -> PREPARED` após correção, com novo hash; ou `AUTHORIZED` após aprovação integral e nova avaliação de política.
- `PENDING_REVIEW -> SKIPPED` após rejeição.
- `AUTHORIZED/SUBMITTING -> BLOCKED` por bloqueio, expiração ou revogação.
- `SUBMITTING -> UNKNOWN_RESULT` quando não há confirmação confiável.
- `SUBMITTING -> SUBMITTED` somente após recibo ou confirmação inequívoca.
- `UNKNOWN_RESULT -> SUBMITTED` somente após reconciliação comprovada; `UNKNOWN_RESULT -> PENDING_REVIEW` para análise manual. Nunca reenviar automaticamente.
- `FAILED` para erro definitivo documentado; falhas transitórias anteriores ao envio podem retentar com limites e backoff.

Implementar `transitionApplication(id, expectedState, nextState, context)` com compare-and-swap no SQLite, tabela de transições permitidas e registro imutável do evento na mesma transação. Estado final `SUBMITTED` nunca retrocede. Resultados de recrutamento (`entrevista`, `oferta`, etc.) pertencem a dimensão separada, não à máquina de submissão.

## 7. SQLite — schema inicial

Usar migrações versionadas, `PRAGMA foreign_keys=ON`, `PRAGMA journal_mode=WAL`, `busy_timeout`, índices e transações `BEGIN IMMEDIATE` nas reservas. Reconciliar nomes com o schema existente sem descartar histórico.

```sql
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT,
 canonical_url TEXT NOT NULL, company TEXT NOT NULL, title TEXT NOT NULL,
 description_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
 discovered_at TEXT NOT NULL,
 UNIQUE(platform, canonical_url)
);
CREATE TABLE IF NOT EXISTS applications (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
 state TEXT NOT NULL, score INTEGER, match_json TEXT,
 candidate_profile_version TEXT, resume_sha256 TEXT, answers_sha256 TEXT,
 form_fingerprint TEXT, policy_version TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 submitted_at TEXT, confirmation_ref TEXT,
 UNIQUE(job_id)
);
CREATE TABLE IF NOT EXISTS application_events (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 from_state TEXT, to_state TEXT NOT NULL, reason_code TEXT NOT NULL,
 actor TEXT NOT NULL, metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS authorizations (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 job_id TEXT NOT NULL, policy_version TEXT NOT NULL,
 form_fingerprint TEXT NOT NULL, resume_sha256 TEXT NOT NULL,
 answers_sha256 TEXT NOT NULL, granted_by TEXT NOT NULL,
 granted_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 consumed_at TEXT, revoked_at TEXT,
 UNIQUE(id, application_id)
);
CREATE TABLE IF NOT EXISTS submission_attempts (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 authorization_id TEXT NOT NULL REFERENCES authorizations(id),
 idempotency_key TEXT NOT NULL UNIQUE, run_id TEXT NOT NULL,
 state TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT,
 confirmation_ref TEXT, evidence_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_submission
 ON submission_attempts(application_id)
 WHERE state IN ('RESERVED','IN_FLIGHT','UNKNOWN','CONFIRMED');
CREATE TABLE IF NOT EXISTS review_queue (
 id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id),
 reason_codes_json TEXT NOT NULL, status TEXT NOT NULL,
 requested_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT,
 decision TEXT, comment TEXT
);
CREATE TABLE IF NOT EXISTS execution_runs (
 id TEXT PRIMARY KEY, mode TEXT NOT NULL, dry_run INTEGER NOT NULL,
 started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,
 submissions_count INTEGER NOT NULL DEFAULT 0, estimated_cost_usd REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS system_controls (
 key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_application_events_app ON application_events(application_id,created_at);
CREATE INDEX IF NOT EXISTS idx_applications_state ON applications(state);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
```

Acrescentar restrições CHECK e triggers conforme suporte/versão do SQLite. `UNIQUE(job_id)` é política MVP: uma candidatura por vaga normalizada; deduplicar anúncios espelhados por chave composta (empresa, título, local, externalId e URL canônica), com revisão para colisões. A tabela de tentativas deve registrar também tentativas simuladas com estado distinto e sem consumir autorizações reais.

**Limites concorrentes:** reservar cotas diárias e por execução na mesma transação da autorização/attempt, usando timezone configurado. Contabilizar tentativas `IN_FLIGHT`, `UNKNOWN` e `CONFIRMED` como cota ocupada, para evitar excesso após falhas. Não depender somente de `submissions_count` em memória.

## 8. Gateway de submissão — requisito crítico P0

O LLM não pode acessar um browser com permissão de clique irrestrito em páginas de candidatura. Remover do agente principal a ferramenta genérica de clique/submissão para contextos de candidatura e não permitir execução arbitrária de JavaScript, scripts ou ferramentas MCP que recuperem tal capacidade. Criar dois contextos separados:

1. **Reader/Preparer:** leitura, extração, preenchimento de campos permitidos e upload de documentos em sessão restrita; nenhum caminho para `submit`, Enter implícito, `requestSubmit()`, POST de candidatura ou ferramentas alternativas de navegação irrestrita.
2. **SubmissionGateway:** processo isolado com acesso ao adaptador de envio, que só recebe comandos tipados e verifica a política, hashes, fingerprint do formulário, estado, limites, kill switch e autorização válida.

A segurança não pode depender de bloquear apenas um seletor de botão. Isolamento por processo e controle de capabilities são obrigatórios; um browser MCP genérico na mesma sessão com permissão de submissão torna o gate ineficaz. Para páginas sem separação tecnicamente comprovada entre preenchimento e envio, exigir conclusão manual e marcar adaptador como `REVIEW_ONLY`.

Contrato:

```ts
export interface SubmissionGateway {
  submit(request: SubmissionRequest): Promise<SubmissionResult>;
}
export interface PolicyEngine {
  evaluate(job: Job, match: MatchResult, prepared: PreparedApplication): Promise<{
    action: PolicyAction; reasonCodes: string[]; policyVersion: string;
  }>;
}
```

Algoritmo obrigatório do gateway:
1. Validar autenticação do chamador, schema e origem; rejeitar acesso do LLM direto ao gateway sem token de capacidade.
2. Checar `DRY_RUN`, `LIVE_SUBMISSION_ENABLED`, kill switch e política por plataforma; falhar fechado.
3. Em transação: verificar estado `AUTHORIZED`, autorização não consumida/não expirada/não revogada, correspondência de job/form/resume/answers/policy, ausência de tentativa ativa e disponibilidade de cotas; criar reserva e consumir autorização atomicamente.
4. Validar novamente fingerprint do formulário e contexto do site no adaptador; divergência implica `PENDING_REVIEW`, sem envio.
5. Executar **uma** ação de submissão permitida pelo adaptador; nenhum retry automático após início de efeito externo.
6. Coletar confirmação inequívoca, mascarar PII em evidências, persistir `CONFIRMED`/`UNKNOWN`/`BLOCKED` e transição de estado.
7. Se processo morrer entre clique e confirmação, recuperar como `UNKNOWN_RESULT`, nunca como `FAILED` apto a retry.

A atomicidade SQLite não garante exatamente uma execução no sistema remoto. A garantia possível é **no máximo uma tentativa automatizada por autorização**, com reconciliação para resultados desconhecidos.

## 9. Revisão humana e dashboard

Fila com motivo, vaga, score, requisitos não atendidos, campos incertos, currículo/versionamento, respostas propostas, política e evidências. Ações: aprovar, rejeitar, editar respostas, solicitar novo currículo, abrir portal para conclusão manual. Qualquer edição invalida hashes e autorização anterior. Exigir autenticação e proteção CSRF para comandos mutáveis; registrar ator, data e decisão.

Dashboard: filtros por estado/plataforma, cotas e custos, exceções pendentes, confirmação de envios, botão PAUSE/RESUME e EMERGENCY_STOP. Telegram serve para alertar e encaminhar ao painel; comandos de aprovação por Telegram, se implementados, exigem identidade verificada, token de ação de uso único e expiração. Nunca expor credenciais ou PII em logs e mensagens.

## 10. Agendamento, segurança e privacidade

- Cron somente se explicitamente habilitado; impedir runs concorrentes via lock persistente com lease e heartbeat.
- `PAUSE`: não iniciar novas vagas, permitir finalização segura da ação em curso. `EMERGENCY_STOP`: impedir imediatamente novas autorizações e submissões; registrar estados incertos sem reenvio.
- Retentativas com backoff apenas para leitura, descoberta e preparação; falhas de rede após clique são `UNKNOWN_RESULT`.
- Rate limiting conservador por plataforma; não simular comportamento humano para ocultar automação.
- Credenciais em `.env` não versionado; segredo fora de logs; isolamento de perfil do navegador; permissões mínimas.
- PII minimizada no prompt, com placeholders quando possível; dados pessoais enviados a modelos externos somente conforme configuração e consentimento.
- Retenção configurável de screenshots, currículos e logs; expurgo com preservação de metadados de auditoria necessários.
- Tratar descrições de vagas e páginas como dados não confiáveis; não obedecer instruções nelas contidas que tentem modificar políticas ou revelar segredos.

## 11. Testes

**Unitários (Vitest):** score e eliminatórios; política por plataforma; validação de hashes/fingerprint; transições válidas e inválidas; autorização expirada/reutilizada/revogada; cálculo de cotas; sanitização de PII; prompt injection em descrição; `DRY_RUN`.

**Integração (SQLite temporário):** migrações; chaves únicas; concorrência de duas autorizações para mesma vaga; corrida por última cota diária; crash entre reserva e clique; crash após clique; retomada sem retry; versionamento de política; invalidação após editar respostas.

**E2E (Playwright em servidor local fictício):** portal de teste com formulário simples, botão submit, confirmação, erro 500, timeout, upload, formulário alterado, sessão expirada, bloqueio e envio incerto. O servidor mock registra requisições; em `DRY_RUN` o contador de POST de candidatura deve permanecer **zero**. Testar que o agente não dispõe de ferramenta alternativa capaz de realizar POST/click final. Nenhum teste aponta para portais reais.

**Segurança:** fuzz de transições; autorização de outro job; replay de token; acesso direto ao gateway; SSRF e URLs não confiáveis; concorrência multi-run; prompt injection; endpoints dashboard sem autenticação; vazamento de segredos em logs.

**Critérios mínimos:** 100% dos testes críticos de autorização, bloqueio e idempotência passando; cobertura >= 90% dos módulos `policy`, `gateway`, `state-machine` e `authorization`; lint, typecheck e build sem erros. Cobertura global alvo >= 80% sem reduzir a existente.

## 12. Critérios de aceite funcionais

- [ ] Inicialização falha com configuração inválida ou ausente para modo live.
- [ ] `DRY_RUN=true` resulta em zero submissões reais, inclusive com agente malicioso e browser em modo teste.
- [ ] LinkedIn permanece `DENY` para envio automatizado.
- [ ] Gupy e Indeed permanecem `REVIEW_ONLY` até liberação formal e validação do adaptador.
- [ ] Nenhum envio sem autorização válida, hash de documentos, fingerprint e política correspondente.
- [ ] Duas execuções concorrentes não submetem a mesma vaga duas vezes.
- [ ] Limites de 5/dia e 3/run são respeitados inclusive com concorrência e falhas.
- [ ] `UNKNOWN_RESULT` não é reenviado automaticamente.
- [ ] Nenhuma resposta desconhecida é inventada; exige revisão.
- [ ] Histórico registra decisões, evidências, versões e custos sem expor segredos.
- [ ] Dashboard permite revisão, pausa e emergência com autenticação.
- [ ] Todos os testes E2E usam apenas portais fictícios.
- [ ] Produção não é habilitada automaticamente após merge/deploy.

## 13. Backlog por Pull Request

| PR | Prioridade | Escopo | Dependência | Aceite |
|---|---|---|---|---|
| PR-01 | P0 | Auditoria, mapa de capacidades MCP, ADR, configuração tipada e baseline de testes | Nenhuma | Riscos documentados; DRY_RUN default; nenhuma submissão |
| PR-02 | P0 | Domain contracts, máquina de estados, migrações SQLite e repositórios | PR-01 | Transições e concorrência testadas |
| PR-03 | P0 | Policy engine, scoring explicável, filtros e políticas por plataforma | PR-02 | LinkedIn DENY, critérios eliminatórios prevalecem |
| PR-04 | P0 | Isolamento do browser, SubmissionGateway, autorização de uso único, cotas e kill switch | PR-02/03 | Nenhum caminho alternativo de submissão; E2E mock comprovado |
| PR-05 | P1 | Currículo/respostas com proveniência, hashes, preparação e fila de revisão | PR-03/04 | Edições invalidam autorização; dados incertos vão à fila |
| PR-06 | P1 | Dashboard autenticado, auditoria, Telegram e comandos de pausa | PR-05 | Aprovações rastreáveis, PII protegida |
| PR-07 | P1 | Scheduler, locks, recuperação, reconciliação, métricas e custo | PR-04/06 | Crash/restart sem reenvio; cotas consistentes |
| PR-08 | P1 | Suite E2E, hardening, documentação operacional, piloto somente dry-run | Todos | Critérios de aceite completos; live continua desabilitado |

Cada PR deve conter: descrição, ADR quando necessário, migração se houver, testes, evidências de execução, riscos residuais, instruções de rollback e checklist de segurança. Proibir commits automáticos na branch principal; abrir PR para revisão.

## 14. Instrução de execução para Codex

1. Clonar/forkar o repositório e fixar SHA da revisão auditada.
2. Ler README, package.json, tsconfig, testes, `src`, `config` e fluxos MCP reais. Não presumir nomes de módulos a partir desta SPEC.
3. Criar `docs/specs/SPEC-001-supervised-autonomous.md` e ADR sobre isolamento de submissão.
4. Entregar diagnóstico de gaps e plano detalhado antes de editar funcionalidades.
5. Implementar PRs em ordem, em branches isoladas, com testes e revisão humana.
6. Manter `DRY_RUN=true` e `LIVE_SUBMISSION_ENABLED=false` em todas as execuções desta tarefa.
7. Não acessar contas pessoais, enviar candidaturas reais, contornar bloqueios nem ativar produção.
8. Ao final, entregar relatório com arquivos alterados, comandos/testes executados, limitações e próximos passos.

## 15. Fontes

- Repositório original e README: https://github.com/LuisMIguelFurlanettoSousa/auto-apply-bot
- Restrições de uso e termos devem ser verificados nas páginas oficiais atualizadas de cada plataforma antes de habilitar qualquer adaptador.

**Nota:** esta SPEC é um desenho técnico proposto a partir do README público, não uma afirmação de que o código atual já possui as novas interfaces ou barreiras. Não houve envio de candidaturas reais.
