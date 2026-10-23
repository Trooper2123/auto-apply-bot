# Diagnóstico técnico e plano — Backend Java Pleno

Data: 22/10/2026. Etapa: auditoria e planejamento; nenhuma adaptação funcional foi implementada, nenhuma candidatura foi enviada e nenhum commit foi criado.

## Escopo e base de evidências

Repositório solicitado: https://github.com/LuisMIguelFurlanettoSousa/auto-apply-bot

A cópia local tem origem no fork `Trooper2123/auto-apply-bot`, commit `6dd9a5526fa3a771826cc59a565a238c938c3f4f`. Comparei o conteúdo local com `main` do repositório solicitado: `package.json`, `package-lock.json`, `src/index.ts`, `src/agente.ts`, `src/tools.ts`, `src/scoring.ts`, `src/curriculo-tailored.ts` e `src/mcp-client.ts` coincidem, normalizando as quebras de linha. Isso confirma os achados centrais no upstream, mas não equivale a comparar toda a árvore nem fixa o SHA remoto. Os testes foram executados na cópia local.

Arquivos de código e configuração rastreados permaneceram sem alterações. Foram gerados este relatório, dependências em `node_modules/` e evidências/cache em `.audit-cache/`. A pasta `.idea/` já existia e foi preservada.

## Parecer

A base é reaproveitável para busca e preparação assistida. O envio automatizado ainda não satisfaz as garantias pedidas: o modo seguro não é padrão no código, não há aprovação humana por candidatura e o modelo tem acesso direto às ferramentas do navegador. Trocar Gemini por OpenAI não resolve essas falhas de controle.

Manter TypeScript, Node.js, SQLite, Vitest e Playwright MCP. PostgreSQL é tecnologia das vagas-alvo; não há necessidade demonstrada de migrar o banco local. Priorizar controle de execução, veracidade do currículo e rastreabilidade antes da migração de modelo.

## Arquitetura e dependências

Fluxo atual: `index.ts` carrega JSON/ambiente e inicializa banco, dashboard, notificações e MCP; `agente.ts` mantém o loop Gemini e despacha ferramentas; `tools.ts` concentra operações de negócio; `database.ts` persiste candidaturas, vagas vistas, respostas e execuções. Currículo, carta e mensagem usam `llm-adapter.ts`, com Gemini, Ollama e OpenAI-compatible.

Pontos positivos: TypeScript estrito, scoring puro, consultas SQL parametrizadas, unicidade por URL, WAL, ferramentas executadas sequencialmente, limite de iterações, classificação de falhas, poda do histórico, dashboard em loopback com escape HTML, dados pessoais fora do Git e versão do MCP explicitamente fixada.

Limites: loop e histórico acoplados ao SDK Gemini; `tools.ts` tem mais de 1.200 linhas; singletons de banco/provedores; validação de entrada baseada em casts TypeScript; decisões críticas entregues ao modelo; ausência de uma operação de envio controlada pela aplicação. Não é necessário refatorar toda a arquitetura: introduzir a fronteira de aprovação e ajustar os módulos existentes é suficiente para começar.

Versões do lockfile:

| Dependência | Versão | Observação |
| --- | --- | --- |
| `@google/genai` | 1.43.0 | Requer Node >=20; contradiz README com Node 18+ |
| `@modelcontextprotocol/sdk` | 1.27.1 | Alertas no audit; aplicação usa cliente stdio |
| `better-sqlite3` | 11.10.0 | Módulo nativo; instalação falhou no Node 26/Windows |
| `nodemailer` | 7.0.13 | Alertas; correção sugerida pelo npm envolve major |
| `vitest` | 4.1.9 | Alertas em ferramentas de desenvolvimento |
| `vite` | 8.0.16 | Requer Node ^20.19 ou >=22.12 |
| `tsx` | 4.22.4 | Execução TypeScript |

`@playwright/mcp@0.0.76` é iniciado por `npx`, fora do lockfile do projeto. O pin reduz variação de versão, mas a instalação transitiva precisa de avaliação própria. O audit do projeto não cobre integralmente esse pacote executado externamente. Planejar dependência local fixada e instalação reproduzível.

## Riscos e defeitos, por prioridade

| ID | Prioridade | Evidência | Impacto e ação |
| --- | --- | --- | --- |
| R1 | P0 | `src/index.ts:47`: `process.env.DRY_RUN === 'true'` | Variável ausente ou valor inválido resulta em modo real, desde que as demais configurações permitam iniciar. Ausência deve manter simulação; valor inválido deve impedir execução. |
| R2 | P0 | `src/tools.ts:652`; `src/agente.ts:371` | `confirmar_envio` libera automaticamente em produção; chamadas MCP não passam por uma barreira humana. Bloquear ferramentas genéricas capazes de envio; primeiro MVP com envio final manual pelo usuário. |
| R3 | P0 | `src/tools.ts:603` | Score e blacklist barram o registro depois do possível envio; score é fornecido pelo modelo e não vinculado a uma avaliação persistida. Eliminações e aprovação devem ser verificadas antes do efeito externo. |
| R4 | P0 | `src/curriculo-tailored.ts:105`; `src/validacao-skills.ts` | Template acrescenta CI/CD e Git ao encontrar Docker. Lista limitada de skills suspeitas não valida empresas, datas, métricas ou responsabilidades; Spring pode autorizar Spring Boot indevidamente. Renderizar apenas fatos aprovados e registrar sua origem. |
| R5 | P0 | `src/curriculo-tailored.ts:225,255` | HTML vindo do modelo só é examinado por menções a skills e é aberto no Chrome com `--no-sandbox`; não há sanitização de scripts, recursos externos ou conteúdo ativo. Gerar HTML local escapado a partir de dados estruturados e manter sandbox. |
| R6 | P0 | `npm audit` de 22/10/2026 | 17 dependências afetadas: 1 crítica, 9 altas, 6 moderadas e 1 baixa. Só produção: 11, sendo 1 crítica, 5 altas, 4 moderadas e 1 baixa. Atualizar com testes e avaliar alcance real dos alertas. |
| R7 | P1 | `src/scoring.ts:79–125` | Java casa com JavaScript; híbrido fora do DF pode passar; júnior ganha bônus; sênior só perde pontos. Não existe filtro obrigatório para Backend Java Pleno, elegibilidade remoto Brasil ou justificativa por componente. |
| R8 | P1 | `config/sites.json`; usos de `palavras_chave_busca` | Buscas continuam amplas/full stack. `palavras_chave_busca` só chega ao prompt via perfil; não monta as URLs. Alterar perfil isoladamente não configura efetivamente a coleta. |
| R9 | P1 | `src/database.ts:106,221` | URL exata é a chave; dry-run conta como candidatura e como duplicata. Tracking na URL permite duplicidade; simulação pode impedir futura candidatura real. Separar vaga, tentativa e submissão. |
| R10 | P1 | `src/agente.ts:42–46` no fluxo do prompt; `src/tools.ts:807`; `src/database.ts:167` | Prompt pede screenshot antes do registro; atualização do caminho afeta zero linhas se candidatura ainda não existe. Screenshot via base64 intermediado pelo modelo não oferece proveniência robusta. Persistir tentativa antes da captura e salvar artefato diretamente. |
| R11 | P1 | `src/tools.ts:927`; `src/agente.ts:439`; `src/index.ts` | Retries por URL ficam em memória; falhas podem virar somente texto/log; erro fatal retornado como string não entra necessariamente em `log_execucoes.erros`. Não existe histórico estruturado completo por tentativa. |
| R12 | P1 | `src/agente.ts:360,386`; `obter_perfil_candidato` | Perfil completo volta ao modelo; argumentos e resultados são parcialmente gravados em log sem mascaramento. Anonimização parcial não garante privacidade. Preenchimento local, minimização e retenção explícita de logs/artefatos. |
| R13 | P1 | `src/curriculo-tailored.ts:168` | Cache usa só os primeiros 500 caracteres da vaga e não inclui perfil/modelo/versão. Pode reutilizar currículo desatualizado ou inadequado após mudar o perfil. |
| R14 | P1 | `src/token-tracker.ts`; `src/agente.ts:321` | Preço Flash incorreto, OpenAI cai no preço fictício de Gemini Pro; teto desativado por padrão e verificado depois da chamada. Preços e orçamento devem abranger todos os provedores, auxiliares e retries. |
| R15 | P1 | `src/tools.ts:943–982`; `src/notificacoes.ts` | Tratamento manual de CAPTCHA já existe e não usa solver. Porém bloqueio de portal só controla respostas da tool, não navegação; CAPTCHA/sessão podem marcar vaga como permanentemente descartada. Pausar de fato; manter estado recuperável e confirmação local após intervenção. |
| R16 | P2 | `database.ts`, `email.ts`, configuração | Migrações silenciam qualquer erro como se coluna já existisse; relatório de email não escapa conteúdo externo; números não têm faixas validadas. Corrigir sem reestruturação ampla. |

A severidade de uma dependência não comprova exploração neste aplicativo: por exemplo, `proxy-addr` aparece como crítica, mas o dashboard usa `http` nativo e o MCP é cliente stdio. É necessário verificar os caminhos atingíveis e a árvore do MCP externo antes de classificar risco operacional. Não executei exploits nem apliquei `npm audit fix --force`.

Também existe risco de prompt injection: descrições e páginas externas entram no contexto de um modelo com ferramentas poderosas. Instrução no prompt não constitui controle de autorização. Permissões devem ser verificadas no código, independentemente do provedor.

## Validação no Windows

Ambiente observado: Windows 10.0.26200, PowerShell, Node v26.3.0 e npm 11.16.0. Chrome encontrado em `C:\Program Files\Google\Chrome\Application\chrome.exe`; `google-chrome` e `which` não encontrados no PATH.

| Verificação | Resultado |
| --- | --- |
| `npm ci --no-fund --cache .audit-cache/npm` | Falhou: sem prebuild de better-sqlite3 para Node 26.3.0/win32/x64; node-gyp não encontrou Python para compilar |
| `npm ci --ignore-scripts --no-audit --no-fund --cache .audit-cache/npm` | Instalou 250 pacotes; não é uma instalação operacional, pois não produz o binding SQLite |
| `npm run typecheck` após instalação sem scripts | Passou |
| `npm run test:run` após instalação sem scripts | 10 arquivos passaram; 2 falharam na preparação por falta do binding SQLite; 63 testes passaram e 16 foram pulados, de 79 coletados |
| Encerramento Vitest | Aviso de processo/recurso pendente após timeout de 10s; origem não isolada |
| Execução do bot contra portais | Não executada nesta auditoria |

Antes da instalação sem scripts, typecheck e Vitest também falharam por dependências ausentes após o `npm ci` incompleto; esses resultados não são defeitos independentes de TypeScript.

Problemas adicionais por inspeção: `npm run chrome` usa executável Linux e omite perfil dedicado; geração de PDF procura Chrome por `which` e retorna `google-chrome`; README usa `nano` e atribuição de variável no formato POSIX. Validar uma versão Node suportada pelo projeto, inicialmente candidata Node 22 >=22.12, em Windows limpo antes de fixar o runtime; não presumo que a troca sozinha garanta sucesso.

Chrome moderno exige diretório de perfil não padrão para depuração do Chrome comum. O plano deve detectar o executável Windows, usar perfil dedicado e manter CDP em loopback. Referência: https://developer.chrome.com/blog/remote-debugging-port

## Política de busca e matching proposta

Configurar consultas independentes para não exigir que todo anúncio mencione simultaneamente as cinco tecnologias: Java Pleno, Backend Java Pleno, Java Spring Boot, Kotlin Backend, Java AWS e Java PostgreSQL, com variações em inglês. A relação com Java/backend deve ser validada no anúncio, principalmente nas buscas Kotlin. Criar conjuntos separados para remoto Brasil e híbrido Brasília/DF; validar o comportamento atual dos filtros em cada portal.

Prioridade sugerida: remoto elegível para residentes no Brasil; em seguida híbrido com local efetivo no Distrito Federal. Entorno fora do DF não entra automaticamente. Remoto restrito ao exterior ou a outra região incompatível deve ser descartado. Presencial, estágio, trainee, júnior e sênior ficam fora do alvo inicial; anúncio com múltiplas senioridades ou localização ambígua vai para revisão.

Não presumir que o candidato domina Kotlin, Spring Boot, AWS ou PostgreSQL só porque são termos de busca. O perfil real e suas experiências precisam ser fornecidos e revisados antes da personalização.

Matching deve retornar `ELEGIVEL`, `ELIMINADA` ou `REVISAR`, com evidências do anúncio e do perfil. Informação ausente não equivale a requisito satisfeito. Critérios eliminatórios: senioridade/cargo incompatível, local/modelo incompatível, restrição geográfica, idioma ou outro requisito explicitamente obrigatório que o perfil comprovadamente não atende, blacklist e candidatura real já confirmada. Exigência não comprovada gera revisão; ausência de dado não autoriza envio.

Depois dos eliminatórios, sugestão inicial de pontuação de 0 a 100: Java 25; Spring Boot 20; Kotlin 10; AWS 10; PostgreSQL 10; aderência backend 10; pleno 5; local/modelo 10 (remoto Brasil 10, híbrido DF 8). Pontos técnicos exigem correspondência entre anúncio e evidência real do perfil. Usar aliases explícitos, como PostgreSQL/Postgres, sem inferir Java a partir de JavaScript ou Spring Boot a partir de Spring.

Pesos e corte são proposta a calibrar num conjunto de anúncios rotulados, não uma medida validada. Exibir contribuições, lacunas e trecho fonte; um score alto não supera eliminatório nem autoriza envio. Preferência geográfica pode ordenar primeiro por faixa remoto/DF e depois por score, garantindo a prioridade solicitada.

## Fluxo assistido e aprovação

Primeiro MVP: coletar e avaliar vagas; preparar um pacote revisável com anúncio, explicação, currículo e respostas; registrar aprovação ou rejeição explícita; o usuário realiza upload/preenchimento final e envio no próprio navegador. Isso permite concluir a busca e preparação sem conceder ao agente ferramentas genéricas de escrita em páginas autenticadas. Formulários podem salvar dados automaticamente e cliques aparentemente intermediários podem enviar candidaturas de um passo; bloquear somente um botão final não garante dry-run.

Se posteriormente houver envio pela aplicação, criar uma operação específica por fluxo suportado, fora do controle direto do modelo. Aprovação local vinculada ao ID da vaga, hash do currículo/respostas e estado atual do formulário, expiração curta e uso único. Revalidar eliminatórios, duplicidade, limites e DRY_RUN na execução; mudança no material invalida aprovação. Ausência, timeout ou recusa bloqueiam. O modelo não pode criar a aprovação nem usar click/type/Enter/evaluate/run-code, upload ou outra rota como alternativa de envio.

DRY_RUN permanece padrão em CLI, cron e testes, e deve impedir efeitos externos de candidatura, mensagens e upload de documentos. Aprovar um pacote não desativa DRY_RUN. Notificação de CAPTCHA e aprovação de candidatura são eventos distintos. Contato com recrutador permanece desativado no escopo inicial.

Estados mínimos: descoberta → avaliada → rascunho → aguardando aprovação → aprovada/rejeitada; simulação registrada separadamente. Para submissão futura: enviando → enviada com evidência, falhou ou resultado desconhecido. Após timeout de envio, reconciliar antes de tentar novamente; não repetir uma submissão de resultado incerto.

## Currículo fiel e rastreabilidade

Manter fatos de origem com identificadores: experiências, empresas, cargos, períodos, formação, certificações e competências comprovadas. Primeiro permitir seleção e reordenação de fatos aprovados; manter os textos originais. Qualquer reescrita proposta por IA precisa mostrar comparação com a origem e receber revisão humana. Novas métricas, experiências ou competências nunca entram automaticamente.

Gerar HTML escapado localmente; limitar os links aos contatos aprovados; não aceitar HTML arbitrário do modelo. Cache inclui hash do perfil completo e do anúncio, versão do template e da política. Validar saída sem placeholders e PDF gerado antes de oferecer para candidatura. Detectar arquivo ausente e retornar erro explícito, sem arquivo inadequado como fallback silencioso.

SQLite permanece suficiente: vaga com identificador estável da plataforma/URL normalizada; tentativas com modo, timestamps, etapa, falha, retry, decisão de matching, aprovação e hashes; artefatos ligados à tentativa e metadados de proveniência. Guardar o texto observado do anúncio ou snapshot local, com data de coleta. Eventos de falha não devem ser apagados pelo resultado seguinte. Simulação não consome limite real nem bloqueia aplicação real. Migrar dados existentes com backup e sem perder registros históricos.

Capturar screenshot diretamente pela camada de execução e salvar antes de finalizar a tentativa. Evidência precisa distinguir formulário preparado de confirmação efetiva do site. Se não houver confirmação verificável, registrar resultado desconhecido. Mascarar PII nos logs e permitir retenção limitada dos artefatos; não enviar perfil, screenshots ou logs a terceiros por padrão.

CAPTCHA/bloqueio: registrar evidência, pausar a origem, solicitar intervenção humana local quando aplicável; timeout encerra a tentativa sem marcar a vaga como rejeitada definitivamente. Sem solver, proxies rotativos, técnicas stealth ou repetição para contornar bloqueio. Após intervenção, revalidar página e sessão; acesso persistentemente bloqueado encerra a origem.

## Gemini → OpenAI e controle de custos

A migração é tecnicamente viável. O adapter atual OpenAI usa `/chat/completions` apenas para texto auxiliar; seu método `generate(prompt)` não suporta o loop de ferramentas do agente. Apenas alterar `LLM_AUX_PROVIDER` não migra o principal e `GEMINI_API_KEY` continua obrigatória no bootstrap.

Menor caminho: definir o contrato mínimo da rodada do agente (texto, chamadas com IDs, resultados e uso), implementar a alternativa OpenAI e manter política/execução das ferramentas compartilhadas. Atualizar histórico, schemas de tools, correlação chamada/resultado, erros, configuração e contabilidade. Usar Responses API com function calling local e saídas estruturadas quando necessário; não há necessidade inicial de Agents SDK, banco vetorial ou novo framework. Reutilizar fetch existente se suficiente. OpenAI Docs confirma suporte a tools: https://developers.openai.com/api/reference/responses/overview

Modelo exato fica pendente de benchmark e acesso na conta; não há evidência nesta auditoria para afirmar vantagem de qualidade ou economia. Comparar um modelo econômico compatível com tools ao Gemini atual sobre os mesmos anúncios/formulários locais, medindo custo por pacote correto, taxa de erro, latência, quantidade de chamadas e incidentes de conteúdo inventado. Segurança é condição obrigatória, não métrica compensável por menor custo.

Preço atual consultado para Gemini 2.5 Flash Standard: US$0,30 por milhão de tokens de entrada textual, US$2,50 de saída incluindo thinking e US$0,03 de entrada cacheada. O código usa 0,15/0,60/0,0375. Em um exemplo de 100 mil tokens novos de entrada e 10 mil de saída, sem cache ou extras, custo correto é US$0,055 e o tracker calcula US$0,021. Fontes: https://ai.google.dev/gemini-api/docs/pricing e https://developers.openai.com/api/docs/pricing

Não usar preço Gemini para modelo desconhecido. Recusar início sem preço conhecido ou orçamento explícito. Configurar teto inicial proposto de US$0,50 por execução de avaliação, com limite diário acumulado e reserva antes de cada chamada; limitar saída/contexto/retries e contar auxiliares/fallbacks. Esse valor é proposta, não gasto autorizado nesta etapa. Uma verificação após a chamada é teto aproximado, não garantia financeira rígida. Não executar fallback caro silencioso; persistir consumo por execução e mostrar saldo. Minimizar PII e usar `store: false` quando aplicável, sem apresentar essa opção como garantia de retenção zero.

## Backlog e plano de implementação

| Ordem | Entrega | Arquivos/alcance | Critério de aceite |
| --- | --- | --- | --- |
| P0.1 | Segurança padrão e configuração validada | `index.ts`, `types.ts`, `.env.example`, testes de config | Variável ausente mantém DRY_RUN; inválida falha; faixas e URLs validadas; cron não autoriza envio |
| P0.2 | Fronteira de ferramentas e revisão humana | `agente.ts`, `tools.ts`, `mcp-client.ts`, CLI/aprovação, testes adversariais | Nenhum efeito externo sem aprovação válida; primeira entrega com envio manual; ferramentas não permitem atalhos |
| P0.3 | Veracidade e HTML seguro | `curriculo-tailored.ts`, `validacao-skills.ts`, carta/mensagem, fixtures | Zero competências implícitas adicionadas; fatos rastreáveis; HTML local seguro; falhas bloqueiam documento |
| P0.4 | Instalação reproduzível e atualização de dependências | `package*.json`, documentação Windows, execução MCP/PDF, CI | `npm ci`, SQLite, PDF e suite em Windows limpo; alertas corrigidos ou alcance justificado |
| P1.1 | Política Backend Java Pleno e consultas | perfil de exemplo, `sites.json`, `scoring.ts`, `types.ts`, tools e fixtures | Remoto Brasil e híbrido DF corretos; JavaScript não conta como Java; evidências e revisão para ambiguidades |
| P1.2 | Tentativas, aprovações, evidências e deduplicação | `database.ts`, `tools.ts`, logger, dashboard e migrações | Histórico preservado; simulação separada; URL com tracking deduplicada; envio incerto sem retry cego |
| P1.3 | CAPTCHA/bloqueios e recuperação | agente, executor, notificações, erros, testes | Origem efetivamente pausada; nenhum bypass; retomada manual verificável; timeouts recuperáveis |
| P1.4 | Orçamento confiável | tracker, adapter, agente, config e testes | Preços por provider/modelo; custo persistido; teto engloba auxiliares e fallback; modelo desconhecido não recebe preço fictício |
| P2.1 | OpenAI principal opcional e benchmark | adapter, histórico, schemas, agente, README e testes | Mesmas garantias com ambos os provedores; nenhum envio real no benchmark; migração decidida por evidência |

Executar em quatro entregas revisáveis: (1) segurança + Windows/dependências; (2) busca, matching e currículo fiel; (3) histórico, evidências e bloqueios; (4) OpenAI opcional e avaliação de custo/qualidade. Testes acompanham cada mudança, não ficam para a última fase. Não há necessidade de trocar stack, criar microsserviços ou automatizar mensagens a recrutadores.

Antes da configuração pessoal: obter currículo/perfil verdadeiro, comprovação das tecnologias, inglês, disponibilidade e restrições adicionais. Busca-alvo não é declaração de experiência. O corte do score será calibrado com exemplos revisados; não será escolhido para maximizar quantidade de candidaturas.

## Estratégia de testes e conclusão de cada fase

Já existem 12 arquivos de testes com unidades de scoring, blacklist, anonimização, validação de skills, histórico, erros, custos e HTML do dashboard, além de integração SQLite, executor e CDP com servidor HTTP local. Alguns testes usam SDK real sem uma chamada paga bem-sucedida. O teste de liberação automática em produção precisa mudar para refletir aprovação explícita. Não há configuração de cobertura nem workflow CI rastreado encontrado.

Adicionar testes unitários parametrizados para Java versus JavaScript; Postgres/PostgreSQL; pleno versus júnior/sênior; Brasília/DF versus São Paulo e entorno; remoto Brasil versus exterior; dados ausentes; requisitos obrigatórios; todas as parcelas do score. Cobrir default seguro e configuração inválida, veracidade de datas/empresas/skills, cache por versão do perfil e orçamento de todos os provedores.

Integração local com SQLite temporário exclusivo por teste e páginas de formulário controladas: botão final, candidatura de um passo, submit por Enter, autosave, upload, redirecionamento, tool não permitida e instrução maliciosa no anúncio. Sem credenciais nem plataformas reais. Aprovação ausente, vencida, reutilizada ou referente a outro conteúdo sempre deve falhar. Reabertura do banco deve preservar tentativas, evidências e duplicidades; dry-run seguido de tentativa real não deve ser duplicata de submissão.

Testar CAPTCHA, 403, 429, falha de rede e sessão expirada com fixtures; confirmar ausência de ações posteriores no portal pausado e retomada apenas após intervenção. Testar falha de envio com resultado desconhecido sem duplicação. Adaptadores LLM com servidor HTTP local determinístico para tool calling, JSON inválido, erro e timeout; benchmark pago separado, nunca necessário para suite comum.

CI deve rodar `npm ci`, `npm run typecheck` e `npm run test:run` em Windows e Linux com runtime definido. Validar PDF com caminho contendo espaços/acentos e processo encerrando sem recursos pendentes. Testes de configuração devem cobrir também tipos das fixtures, pois o tsconfig atual inclui apenas `src/`.

Reproduzi por execução isolada com asserts os problemas atuais: vaga só com JavaScript/remoto obteve 7/10 e APLICAR para perfil Java; híbrido São Paulo com stack completa obteve 8/10 e APLICAR para perfil Brasília que aceita remoto/híbrido; validador aceitou Spring Boot com apenas Spring no perfil. Essas reproduções comprovam comportamento atual, não aprovação dos novos critérios.

Limites desta entrega: não validei o fluxo real dos portais, abertura de Chrome/CDP autenticado, PDF no Windows nem qualidade comparativa dos modelos. A instalação local ficou sem binding SQLite após `--ignore-scripts` e precisa ser concluída antes do uso. Nenhuma candidatura real, mensagem, commit ou alteração funcional foi realizada.
