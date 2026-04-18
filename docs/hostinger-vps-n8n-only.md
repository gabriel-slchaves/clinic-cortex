# Hostinger VPS: deploy `n8n-only`

Este runbook cobre apenas a linha operacional atual:

- WhatsApp oficial em `n8n`
- `team-service` em Node, já contendo a implementação própria do WhatsApp em modo interno
- Supabase como Auth/DB/Storage
- sem Edge Functions no runtime

## Estrutura sugerida na VPS

```text
/opt/cliniccortex/
  repo/                # clone desta branch
  backups/
    n8n/
    compose/
```

O compose operacional fica no próprio repositório em:

```text
/opt/cliniccortex/repo/deploy/hostinger
```

## Arquivos relevantes

- `deploy/hostinger/docker-compose.yml`
- `deploy/hostinger/Caddyfile`
- `deploy/hostinger/.env.example`
- `deploy/hostinger/env/homolog/proxy.env.example`
- `deploy/hostinger/env/homolog/team-service.env.example`
- `deploy/hostinger/env/homolog/n8n.env.example`

## Endpoints de health expostos

- `GET /health`
  - health público do `team-service` via proxy
- `GET /health/proxy`
  - confirma que o Caddy respondeu
- `GET /health/team`
  - confirma que o proxy alcança o `team-service`
- `GET /health/n8n`
  - confirma que o proxy alcança o `n8n`
- `GET http://127.0.0.1:3002/health`
  - health direto do `team-service` no host
- `GET http://127.0.0.1:5678/healthz`
  - health direto do `n8n` no host

## Observação sobre a transição do WhatsApp

Nesta fase, o `team-service` já pode conter a implementação Node das rotas `/whatsapp/*`, webhook, filas e agent processor. Mesmo assim, o roteamento público continua em `n8n` até que a nova implementação esteja validada em `homolog`.

Regras desta etapa:

- `wa.* /whatsapp/* -> n8n` continua sendo o caminho público
- o runtime Node do WhatsApp é validado direto no `team-service`
- `WHATSAPP_ENABLE_WORKERS=false` e `WHATSAPP_ENABLE_AGENT=false` por padrão até a homolog ficar verde
- o cutover para `team-service` só acontece depois de paridade funcional comprovada

## Ordem recomendada de subida em staging (homolog)

1. Acessar a VPS e clonar a branch ativa:

   ```bash
   cd /opt/cliniccortex
   git clone <repo-url> repo
   cd repo
   git switch homolog
   ```

2. Preparar o diretório de deploy:

   ```bash
   cd deploy/hostinger
   cp .env.example .env
   cp env/homolog/proxy.env.example env/homolog/proxy.env
   cp env/homolog/team-service.env.example env/homolog/team-service.env
   cp env/homolog/n8n.env.example env/homolog/n8n.env
   ```

3. Ajustar `deploy/hostinger/.env` para homolog:

   ```dotenv
   DEPLOY_ENV=homolog
   COMPOSE_SUFFIX=hml
   STACK_NAME=cliniccortex-hostinger-homolog
   ENV_FILE_SUFFIX=.env
   WA_PROXY_HTTP_PORT=80
   WA_PROXY_HTTPS_PORT=443
   N8N_HOST_PORT=5678
   TEAM_SERVICE_HOST_PORT=3002
   ```

4. Preencher os três arquivos reais de env:
   - `env/homolog/proxy.env`
   - `env/homolog/team-service.env`
   - `env/homolog/n8n.env`

5. Subir primeiro `team-service` e `n8n`:

   ```bash
   docker compose up -d --build team-service n8n
   docker compose ps
   ```

6. Validar saúde direta no host antes do proxy:

   ```bash
   curl -f http://127.0.0.1:3002/health
   curl -f http://127.0.0.1:5678/healthz
   ```

   Se a implementação Node do WhatsApp já estiver configurada em homolog, validar também:

   ```bash
   curl -f "http://127.0.0.1:3002/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"
   ```

7. Sincronizar o workflow do WhatsApp no `n8n`:

   ```bash
   cd /opt/cliniccortex/repo
   corepack pnpm workflow:sync:homolog
   ```

8. Subir o proxy:

   ```bash
   cd /opt/cliniccortex/repo/deploy/hostinger
   docker compose up -d proxy
   docker compose ps
   ```

9. Validar o proxy ainda na VPS:

   ```bash
   curl -f -H 'Host: wa-hml.cliniccortex.com.br' http://127.0.0.1/health/proxy
   curl -f -H 'Host: wa-hml.cliniccortex.com.br' http://127.0.0.1/health/team
   curl -f -H 'Host: wa-hml.cliniccortex.com.br' http://127.0.0.1/health/n8n
   ```

10. Só depois apontar DNS do host de homolog para a VPS.

11. Com DNS/SSL válidos, rodar o probe do ambiente:

   ```bash
   cd /opt/cliniccortex/repo
   corepack pnpm workflow:probe:homolog
   ```

## Ajuste mínimo no frontend

Quando a homolog estiver saudável, o frontend de homolog deve usar:

```dotenv
VITE_INTERNAL_SERVICE_ORIGIN=https://wa-hml.cliniccortex.com.br
```

Para produção:

```dotenv
VITE_INTERNAL_SERVICE_ORIGIN=https://wa.cliniccortex.com.br
```

Nenhuma mudança de contrato é necessária.

## O que precisa ser testado quando o ambiente estiver no ar

### Infra básica

- `docker compose ps` mostra `proxy`, `team-service` e `n8n` como `healthy`
- `curl http://127.0.0.1:3002/health` responde `200`
- `curl http://127.0.0.1:5678/healthz` responde `200`
- `curl -H 'Host: ...' http://127.0.0.1/health/proxy` responde `200`
- `curl -H 'Host: ...' http://127.0.0.1/health/team` responde `200`
- `curl -H 'Host: ...' http://127.0.0.1/health/n8n` responde `200`
- SSL do host `wa-*` emite certificado válido

### Workflow e roteamento

- `corepack pnpm workflow:sync:homolog` conclui sem erro
- `corepack pnpm workflow:probe:homolog` conclui sem `404`
- `GET /whatsapp/meta/webhook` responde challenge válido da Meta
- `/whatsapp/connections/status` responde pelo host `wa-*`
- `/whatsapp/connections/onboarding/session` responde pelo host `wa-*`
- `/whatsapp/connections/onboarding/complete` responde pelo host `wa-*`
- `POST http://127.0.0.1:3002/whatsapp/_drain` só é usado internamente, nunca como endpoint público
- `POST http://127.0.0.1:3002/whatsapp/agent/_drain` só é usado internamente, nunca como endpoint público

### Fluxo de aplicação

- login no app continua funcionando
- telas de membership/plano continuam funcionando
- tela de integração WhatsApp carrega sem erro de origem
- onboarding do WhatsApp abre o Embedded Signup
- callback da Meta volta para o app correto
- status da conexão da clínica atualiza depois do onboarding

### Fluxo operacional do WhatsApp

- webhook da Meta chega no `n8n`
- eventos são persistidos no Supabase
- inbound real não retorna `404/500`
- outbound real usa o mesmo contrato `/whatsapp/*`
- nenhum request do app tenta chamar Edge Function
- quando a implementação Node estiver sendo validada, `POST /whatsapp/meta/webhook` no `team-service` aceita payload assinado e enfileira eventos no Supabase
- workers só são ativados com `WHATSAPP_ENABLE_WORKERS=true`
- agent só é ativado com `WHATSAPP_ENABLE_AGENT=true`

### Logs e rollback

- `docker logs` do `team-service` não mostram erro de auth/repositório
- `docker logs` do `n8n` não mostram erro de env ausente
- `docker logs` do proxy não mostram loops ou upstream `502`
- o DNS anterior e os envs atuais de frontend continuam anotados para rollback
- o backup do volume do `n8n` foi executado antes do cutover final
