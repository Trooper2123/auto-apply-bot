# ADR 0001 — Estabilização e isolamento futuro da submissão

Estado: aceita para PR-01; gateway proposto para PR-04. Data: 22/10/2026.

Complemento posterior: o [DRY_RUN atual](../dry-run.md) não executa o agente legado. Ele usa processo separado com cenário sintético e sem MCP, LLM ou notificações. O inventário abaixo documenta as capacidades do legado; não são capacidades do simulador. A necessidade de gateway para habilitar live permanece.
Base auditada: `6dd9a5526fa3a771826cc59a565a238c938c3f4f`.

## Contexto

`confirmar_envio` é uma ferramenta cooperativa. `agente.ts` encaminha chamadas MCP ao navegador, inclusive operações capazes de submeter por clique, Enter, JavaScript ou requisição HTTP. Recusar registro no banco não desfaz um efeito já ocorrido no portal. A flag DRY_RUN sozinha não é uma barreira de submissão.

## Decisão

O PR-01 estabiliza instalação, configuração e testes, sem declarar seguro o browser legado. O bootstrap rejeita `DRY_RUN=false` e `LIVE_SUBMISSION_ENABLED=true` antes de conectar ao navegador. Esses controles não restringem as capabilities MCP nem substituem o gateway. `EXECUTION_MODE` é validado como configuração; a nova máquina de estados ainda não existe.

Os testes não usam sessões pessoais ou portais reais. O smoke exercita SQLite temporário, handshake/listagem MCP sem browser, HTTP em loopback e conversão de uma fixture HTML para PDF em perfil Chrome temporário. O teste de zero POST comprova somente esse cenário local de leitura, não a resistência do agente a uma instrução maliciosa.

No PR-04, separar Reader/Preparer e SubmissionGateway por processo/capabilities, conforme SPEC-001. Browser genérico com escrita na mesma sessão não pode continuar acessível ao agente. Adaptadores sem separação demonstrável exigirão conclusão manual. Gateway deve validar autorização de uso único, política, hashes/fingerprint, cotas e kill switch. Resultado desconhecido exige reconciliação, sem retry automático.

## Mapa de capacidades MCP observado

Inventário completo: [mcp-capabilities.json](../mcp-capabilities.json), obtido por `listTools` no pacote local `@playwright/mcp@0.0.76`, transporte stdio. São 23 ferramentas. Nenhuma foi removida do agente neste PR, para preservar o comportamento enquanto o gateway é projetado.

| Grupo | Ferramentas | Implicação |
| --- | --- | --- |
| Observação | `browser_snapshot`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests` | Exposição de conteúdo/PII; restringir origem, sessão e retenção |
| Execução arbitrária | `browser_evaluate`, `browser_run_code_unsafe` | JavaScript/Node podem recuperar capacidade de submissão; incompatíveis com contexto restrito |
| Requisição ativa | `browser_network_request` | Caminho direto para efeitos HTTP; não basta bloquear botão |
| Interação | `browser_click`, `browser_press_key`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_file_upload`, `browser_drop`, `browser_drag`, `browser_hover`, `browser_handle_dialog` | Submit, autosave, upload e handlers podem produzir efeitos externos |
| Navegação/ciclo de vida | `browser_navigate`, `browser_navigate_back`, `browser_tabs`, `browser_close`, `browser_resize`, `browser_wait_for` | Mudança de contexto e execução de páginas; não presumir operação isolada sem efeitos |

As annotations `readOnlyHint`/`destructiveHint` não são controle de segurança. Reavaliar o inventário após qualquer atualização do MCP; não transformar esta lista em denylist suficiente para segurança.

## Instalação e dependências

O SQLite 11 não instalava no Node 26 do ambiente. SQLite 13 distribui binários N-API dentro do pacote e passa os testes de banco sem compilação. O projeto fixa npm 11.19.1 e permite scripts de instalação somente para esbuild/protobufjs. `allowScripts.better-sqlite3=false` evita a detecção automática de `binding.gyp` pelo npm durante instalação limpa; não elimina o banco nativo nem seus testes. Não é necessário `--ignore-scripts`, Python ou Visual Studio para o alvo Windows x64 validado. Para plataforma sem binário publicado, avaliar suporte antes de habilitar build nativo.

Playwright MCP deixa de ser baixado por `npx` em runtime e passa a ser dependência exata do lockfile, executada pelo Node atual. Atualizações de MCP SDK, Nodemailer e transitivas corrigem os alertas reportados pelo audit; não houve troca do SDK Gemini ou provedor principal.

Chrome é detectado por SO ou `CHROME_PATH`. A conversão usa URL `file:` escapada, perfil temporário independente, sandbox padrão do Chrome e verifica assinatura do PDF. Não aceita saída antiga após falha. Isso não resolve a confiança no HTML produzido pelo modelo; renderização de fatos com proveniência permanece no PR-05.

## Consequências e limites

- Preservados scoring, schema/histórico SQLite, prompts de negócio, geração de textos, notificações e cron, além das mudanças explícitas de configuração/instalação/PDF.
- Nenhuma migração de domínio, aprovação persistente ou política de plataforma foi antecipada.
- A suíte antiga ainda contém teste de liberação cooperativa em produção com configuração sintética, sem navegador. Ele documenta o legado; não autoriza live nem atesta segurança.
- Não usar portais autenticados até os controles dos próximos PRs. Nenhum envio real é autorizado por esta ADR.

## Rollback

Não há migração de banco neste PR. Para desfazer, restaurar os arquivos deste PR a partir da base revisada e reinstalar pelo lockfile correspondente em runtime compatível; não apagar `data/`, perfis, documentos ou logs pessoais. O lockfile antigo volta a ter os problemas de instalação e dependências da auditoria. Nenhum commit/push foi realizado nesta implementação.
