# WhatsApp Cloud API no backend integrado Node

## Arquitetura atual

- `frontend -> wa.* -> team-service` para as rotas de WhatsApp.
- `frontend -> team.* / /api/team -> team-service` para autenticacao, membership e rotas de equipe.
- `team-service` e o backend integrado do ClinicCortex e agora assume o runtime oficial de `/whatsapp/*`, webhook, filas, agent logic e outbound.
- `Supabase` continua como fonte de verdade para:
  - `whatsapp_connections`
  - `whatsapp_connection_credentials`
  - `whatsapp_webhook_events`
  - `whatsapp_messages`
  - `whatsapp_message_status_events`
  - `whatsapp_conversation_jobs`
  - `whatsapp_agent_runs`

O `n8n` sai do papel de cerebro do fluxo. Na VPS operacional ele nao faz mais parte do stack publico; se continuar existindo, deve viver separado e privado para fluxos legados ou automacao auxiliar.

## Servicos do stack

- app local: `http://localhost:3000`
- team-service local: `http://localhost:3002`
- stack local suportado: `app` + `team-service`

Proxy local:

- `/api/whatsapp/* -> http://team-service:3002/whatsapp/*`
- `/api/team/* -> http://team-service:3002/team/*`

Proxy publico:

- `wa.* /whatsapp/* -> team-service`
- `wa.* /team/* -> team-service`

## Variaveis de ambiente

Arquivos canonicos de ambiente:

- `.env.local`
- `.env.homolog`
- `.env.production`

Esses tres arquivos na raiz sao a unica fonte de verdade de configuracao. O compose deriva aliases de container como `SUPABASE_URL`, `PUBLIC_APP_ORIGIN`, `PUBLIC_WA_ORIGIN` e `WEBHOOK_URL` a partir desse conjunto canonico, sem manter segredos em arquivos tracked.

Chaves canonicas compartilhadas:

- `VITE_PUBLIC_LANDING_ORIGIN`
- `VITE_PUBLIC_APP_ORIGIN`
- `VITE_INTERNAL_SERVICE_ORIGIN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_EMBEDDED_SIGNUP_REDIRECT_URI`
- `META_EMBEDDED_SIGNUP_SCOPES`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WEBHOOK_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `TEAM_SERVICE_PORT`
- `TEAM_SERVICE_LOG_LEVEL`
- `TEAM_SERVICE_INTERNAL_URL`
- `WHATSAPP_ENABLE_WORKERS`
- `WHATSAPP_ENABLE_AGENT`
- `WHATSAPP_DRAIN_TOKEN`
- `WHATSAPP_DRAIN_BATCH_SIZE`
- `WHATSAPP_AGENT_HISTORY_LIMIT`
- `WHATSAPP_AGENT_MODEL`
- `GEMINI_API_KEY`
- `N8N_HOST`
- `N8N_PORT`
- `N8N_PROTOCOL`
- `N8N_WEBHOOK_URL`
- `N8N_BLOCK_ENV_ACCESS_IN_NODE`
- `NODE_FUNCTION_ALLOW_BUILTIN`
- `GENERIC_TIMEZONE`

Chaves extras de stack para homolog/producao:

- `DEPLOY_ENV`
- `COMPOSE_SUFFIX`
- `STACK_NAME`
- `WA_PUBLIC_HOSTNAME`
- `ACME_EMAIL`
- `WA_PROXY_HTTP_PORT`
- `WA_PROXY_HTTPS_PORT`
- `TEAM_SERVICE_HOST_PORT`

Aliases injetados pelo compose no `team-service`:

- `SUPABASE_URL`
- `TEAM_SERVICE_PORT`
- `PUBLIC_APP_ORIGIN`
- `PUBLIC_WA_ORIGIN`

As envs do `n8n` so continuam relevantes para execucoes locais ou para um eventual stack privado separado de legado.

## Arquivos principais

- migration Meta base: [20260409_200000_meta_cloud_api_whatsapp.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260409_200000_meta_cloud_api_whatsapp.sql)
- migration de fila/retry: [20260414_000000_n8n_whatsapp_queue.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260414_000000_n8n_whatsapp_queue.sql)
- migration de jobs/agente: [20260417_210000_whatsapp_agent_jobs.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260417_210000_whatsapp_agent_jobs.sql)
- backend integrado: [team-service/src/index.ts](C:/Users/Usuário/Desktop/cliniccortex/team-service/src/index.ts)
- runtime WhatsApp: [team-service/src/modules/whatsapp/service.ts](C:/Users/Usuário/Desktop/cliniccortex/team-service/src/modules/whatsapp/service.ts)
- workflow legado do `n8n`: [workflow.json](C:/Users/Usuário/Desktop/cliniccortex/workflow.json)

## Comandos

- validar backend:
  - `pnpm check:team`
- validar frontend + backend:
  - `pnpm check`
- subir stack local:
  - `pnpm stack:local`
- subir stack homolog:
  - `pnpm stack:homolog`
  - alias para `deploy/hostinger/docker-compose.yml`
- subir stack producao:
  - `pnpm stack:production`
  - alias para `deploy/hostinger/docker-compose.yml`
- subir stack VPS homolog:
  - `pnpm stack:vps:homolog`
- subir stack VPS producao:
  - `pnpm stack:vps:production`

Comandos ligados ao workflow legado do `n8n` continuam disponiveis apenas para fallback local e auditoria:

- `pnpm workflow:generate`
- `pnpm workflow:sync:local`
- `pnpm workflow:sync:homolog`
- `pnpm workflow:sync:production`
- `pnpm workflow:probe:local`
- `pnpm workflow:probe:homolog`
- `pnpm workflow:probe:production`

## Estado da consolidacao

Concluido no repositorio:

- `team-service` virou o backend Node integrado que atende `/team/*` e `/whatsapp/*`
- a maior parte da logica util da trilha Edge foi portada para Node dentro do backend existente
- o roteamento publico de WhatsApp foi cortado para o backend Node
- o `n8n` saiu do caminho publico do WhatsApp e do stack operacional da VPS
- Edge Functions permanecem fora do runtime
- o frontend continua usando o mesmo contrato publico

Escopo atual do backend Node publico:

- `POST /whatsapp/connections/onboarding/session`
- `GET /whatsapp/connections/status?clinicId=...`
- `POST /whatsapp/connections/onboarding/complete`
- `GET /whatsapp/meta/webhook`
- `POST /whatsapp/meta/webhook`
- `POST /whatsapp/_drain`
- `POST /whatsapp/agent/_drain`
- `POST /whatsapp/messages/send`

Observacoes importantes:

- o shape das respostas do frontend foi mantido
- o `n8n` nao deve mais ser tratado como cerebro do fluxo
- workers e agent continuam controlados por `WHATSAPP_ENABLE_WORKERS` e `WHATSAPP_ENABLE_AGENT`

Antes de remover qualquer fluxo legado restante ainda falta:

- validar em `homolog` e producao os workers e o agent do backend Node com credenciais reais
- decidir se o workflow legado do `n8n` continua apenas em ambiente local/privado ou se sera arquivado

## Deploy

Homolog:

- app: `https://app-hml.cliniccortex.com.br`
- wa: `https://wa-hml.cliniccortex.com.br`

Producao:

- app: `https://app.cliniccortex.com.br`
- wa: `https://wa.cliniccortex.com.br`

`workflow.json` passa a ser tratado como artefato legado de fallback/importacao do `n8n`.

Para um teste local minimo do backend integrado, use esta sequencia:

```bash
pnpm stack:local
curl -f http://localhost:3002/health
```

Se `docker compose up` falhar com bind em `3002`, valide o dono atual da porta antes de tentar subir o backend Dockerizado:

```powershell
Get-NetTCPConnection -LocalPort 3002
Get-CimInstance Win32_Process -Filter "ProcessId = <PID>"
```

Se o processo for um `node ... team-service/src/index.ts` local, encerre-o antes do `docker compose up`.
