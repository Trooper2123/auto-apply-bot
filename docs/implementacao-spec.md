# Implementacao da SPEC supervisionada

## Implementado nesta branch

- Contratos Zod, canonicalizacao de URL e identificacao de plataforma.
- Matching Java/Kotlin/Spring Boot/AWS/PostgreSQL com componentes e justificativas; score 8+ elegivel, 6–7 revisao, abaixo de 6 inelegivel. Incertezas e filtros eliminatorios mantem prioridade.
- Politica conservadora: LinkedIn DENY, Gupy/Indeed REVIEW_ONLY, desconhecidas DENY e ATS corporativo DENY ate adaptador validado.
- Repositorio SQLite aditivo com migração versionada, WAL, chaves/estados, eventos imutaveis, revisoes e autorizacoes vinculadas aos hashes aprovados.
- Geracao de trechos HTML somente de fatos aprovados, com escape e rastreio de fonte; gateway autenticado sem adaptador que falha fechado.
- Configuracao de busca Backend Java Pleno em `config/busca-java-backend.json`; salario minimo fica nulo.

## Limites para PR seguinte

O gateway ainda nao reserva cotas, consome autorizacao, acessa adaptador ou recupera crashes; ele bloqueia tudo, mesmo com flags live. A aprovacao de revisao nao submete candidatura. O bootstrap DRY_RUN permanece isolado e ainda usa fixtures/scoring legado, sem gravar nas tabelas supervisionadas. O banco novo e aditivo; candidaturas legadas nao sao migradas.

Faltam dashboard autenticado com CSRF, lease/heartbeat do scheduler, limites duraveis por dia e execucao, controle de custo antes da chamada LLM, reconciliacao de UNKNOWN_RESULT, adaptadores browser restritos, testes E2E Playwright em portal local e retencao configuravel. Nao foram acessadas plataformas ou contas reais, nem verificadas regras oficiais atuais. Nenhuma candidatura real, commit ou push foi realizado.
