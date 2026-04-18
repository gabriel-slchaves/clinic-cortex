# WhatsApp Cloud API via n8n + team-service

## Arquitetura atual

- `frontend -> wa.* -> n8n` para as rotas de WhatsApp.
- `frontend -> team.* / /api/team -> team-service` para autenticação/membership e rotas de equipe.
- `team-service` agora também contém a implementação Node própria de `/whatsapp/*`, webhook, filas e agent logic, mas ela ainda fica fora do caminho público até o cutover.
- `Supabase` continua como fonte de verdade para:
  - `whatsapp_connections`
  - `whatsapp_connection_credentials`
  - `whatsapp_webhook_events`
  - `whatsapp_messages`
  - `whatsapp_message_status_events`

O host `wa.*` continua apontando para o `n8n` nesta fase. A implementação Node no `team-service` serve para consolidar o backend e substituir o runtime provisório depois da validação em `homolog`.

## Serviços do stack

- app local: `http://localhost:3000`
- n8n local: `http://localhost:5678`
- team-service local: `http://localhost:3002`

O `team-service` ainda é obrigatório no stack atual. Ele atende a área de equipe/plano no app e valida, para o `n8n`, se o usuário autenticado pode consultar ou gerenciar a conexão WhatsApp da clínica.

Proxy local:

- `/api/whatsapp/* -> http://n8n:5678/webhook/whatsapp/*`
- `/api/team/* -> http://team-service:3002/team/*`

Proxy público:

- `wa.* /whatsapp/* -> n8n`
- `wa.* /team/* -> team-service`

## Variáveis de ambiente

Frontend:

- `VITE_PUBLIC_LANDING_ORIGIN`
- `VITE_PUBLIC_APP_ORIGIN`
- `VITE_INTERNAL_SERVICE_ORIGIN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

n8n / Meta:

- `SUPABASE_URL`
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
- `TEAM_SERVICE_INTERNAL_URL`
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto`

team-service:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TEAM_SERVICE_PORT`
- `TEAM_SERVICE_LOG_LEVEL`
- `PUBLIC_APP_ORIGIN`
- `PUBLIC_WA_ORIGIN`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_EMBEDDED_SIGNUP_REDIRECT_URI`
- `META_EMBEDDED_SIGNUP_SCOPES`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WEBHOOK_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`
- `WHATSAPP_ENABLE_WORKERS`
- `WHATSAPP_ENABLE_AGENT`
- `WHATSAPP_DRAIN_TOKEN`
- `WHATSAPP_DRAIN_BATCH_SIZE`
- `WHATSAPP_AGENT_HISTORY_LIMIT`
- `WHATSAPP_AGENT_MODEL`
- `GEMINI_API_KEY`

## Arquivos principais

- workflow n8n: [workflow.json](C:/Users/Usuário/Desktop/cliniccortex/workflow.json)
- gerador do workflow: [generate-whatsapp-n8n-workflow.mjs](C:/Users/Usuário/Desktop/cliniccortex/scripts/generate-whatsapp-n8n-workflow.mjs)
- migration Meta base: [20260409_200000_meta_cloud_api_whatsapp.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260409_200000_meta_cloud_api_whatsapp.sql)
- migration de fila/retry: [20260414_000000_n8n_whatsapp_queue.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260414_000000_n8n_whatsapp_queue.sql)
- migration de jobs/agente: [20260417_210000_whatsapp_agent_jobs.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260417_210000_whatsapp_agent_jobs.sql)
- backend de equipe/auth helper: [team-service/src/index.ts](C:/Users/Usuário/Desktop/cliniccortex/team-service/src/index.ts)

## Comandos

- gerar workflow n8n:
  - `pnpm workflow:generate`
- sincronizar workflow no n8n local/homolog/produção:
  - `pnpm workflow:sync:local`
  - `pnpm workflow:sync:homolog`
  - `pnpm workflow:sync:production`
- probe rápido dos endpoints publicados:
  - `pnpm workflow:probe:local`
  - `pnpm workflow:probe:homolog`
  - `pnpm workflow:probe:production`

Os comandos `workflow:sync:*` pressupõem acesso Docker ao host que roda o `n8n` daquele ambiente.

O probe local só deve ficar totalmente verde quando `n8n` e `team-service` estiverem de pé. Se `team-service health` falhar, o onboarding pelo app também falhará nos nós `Resolve Start Access`, `Resolve Status Access` ou `Resolve Complete Access`.
- validar `team-service`:
  - `pnpm check:team`
- subir stack local:
  - `pnpm stack:local`
- subir stack homolog:
  - `pnpm stack:homolog`
- subir stack produção:
  - `pnpm stack:production`

## Estado da migração

Concluído no repositório:

- frontend passou a apontar o WhatsApp para o n8n
- compose local/homolog/produção não executam mais conector dedicado de WhatsApp
- `team-service` extraído para preservar rotas `/team/*`
- helper interno `POST /team/internal/auth/resolve` criado para o n8n validar sessão e permissão da clínica
- envs limpas do legado Baileys / connector Node
- `workflow.json` agora é gerado a partir de um bundle n8n-only
- lógica útil da trilha Edge começou a ser portada para Node dentro do `team-service`
- `team-service` já implementa `/whatsapp/*`, `POST /whatsapp/meta/webhook`, filas e agent processor atrás de flags

Escopo atual do workflow gerado:

- `POST /whatsapp/connections/onboarding/session`
- `GET /whatsapp/connections/status?clinicId=...`
- `POST /whatsapp/connections/onboarding/complete`
- `GET /whatsapp/meta/webhook`
- `POST /whatsapp/meta/webhook`

Observação importante:

- o `n8n` não resolve `:clinicId` e `:connectionId` no path do webhook como um router Express faria
- por isso as rotas operacionais do app foram normalizadas para paths estáticos com `clinicId` e `connectionId` em query/body
- o shape das respostas do frontend foi mantido

Antes do cutover final ainda falta endurecer no workflow do n8n:

- validar em `homolog` a implementação Node do `team-service` usando os mesmos contratos públicos
- ativar workers/agent por env e comparar o resultado operacional
- trocar o proxy público de `/whatsapp/*` do `n8n` para o `team-service`

## Deploy

Homolog:

- app: `https://app-hml.cliniccortex.com.br`
- wa: `https://wa-hml.cliniccortex.com.br`

Produção:

- app: `https://app.cliniccortex.com.br`
- wa: `https://wa.cliniccortex.com.br`

O `n8n` deve receber:

- `WEBHOOK_URL=https://wa-hml.cliniccortex.com.br/` em homolog
- `WEBHOOK_URL=https://wa.cliniccortex.com.br/` em produção

## Observação operacional

`workflow.json` é tratado como artefato exportável/importável do n8n. Sempre que o gerador mudar, rode:

```bash
pnpm workflow:generate
```

Para um teste local mínimo, use esta sequência:

```bash
pnpm stack:local
pnpm workflow:sync:local
pnpm workflow:probe:local
```
