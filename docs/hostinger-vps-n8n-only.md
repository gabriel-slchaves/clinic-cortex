# Hostinger VPS: backend integrado Node com `n8n` opcional

Este runbook cobre a linha operacional atual:

- WhatsApp oficial no `team-service`
- `team-service` em Node como backend integrado
- Supabase como Auth/DB/Storage
- sem Edge Functions no runtime
- `n8n` apenas como fallback curto ou automacao auxiliar opcional

## Estrutura sugerida na VPS

```text
/opt/cliniccortex/
  repo/                # clone desta branch
  backups/
    n8n/
    compose/
```

O compose operacional fica no proprio repositorio em:

```text
/opt/cliniccortex/repo/deploy/hostinger
```

## Arquivos relevantes

- `.env.homolog`
- `.env.production`
- `deploy/hostinger/docker-compose.yml`
- `deploy/hostinger/Caddyfile`

## Endpoints de health expostos

- `GET /health`
  - health publico do `team-service` via proxy
- `GET /health/proxy`
  - confirma que o Caddy respondeu
- `GET /health/team`
  - confirma que o proxy alcanca o `team-service`
- `GET /health/n8n`
  - confirma que o proxy alcanca o `n8n`, se ele ainda estiver presente
- `GET http://127.0.0.1:3002/health`
  - health direto do `team-service` no host
- `GET http://127.0.0.1:5678/healthz`
  - health direto do `n8n` no host, se ele ainda estiver de pe

## Observacao sobre a transicao do WhatsApp

Nesta fase, o `team-service` ja e o runtime publico de `/whatsapp/*`.

Regras desta etapa:

- `wa.* /whatsapp/* -> team-service`
- `wa.* /team/* -> team-service`
- `n8n` fica fora do caminho publico
- `WHATSAPP_ENABLE_WORKERS` e `WHATSAPP_ENABLE_AGENT` precisam refletir o ambiente real antes do go-live
- rollback curto continua possivel enquanto o `n8n` ainda existir privado na VPS

## Politica de branch

- `homolog` e a branch real de integracao
- `main` recebe apenas promocao controlada de `homolog`
- trabalho estrutural novo nao deve mais nascer em `codex/*`

## Ordem recomendada de subida em staging (homolog)

1. Acessar a VPS e clonar a branch ativa:

   ```bash
   cd /opt/cliniccortex
   git clone <repo-url> repo
   cd repo
   git switch homolog
   ```

2. Validar os envs de raiz:

   ```bash
   test -f .env.homolog
   test -f .env.production
   ```

3. Revisar `.env.homolog` para homolog:

   ```dotenv
   DEPLOY_ENV=homolog
   COMPOSE_SUFFIX=hml
   STACK_NAME=cliniccortex-hostinger-homolog
   WA_PUBLIC_HOSTNAME=wa-hml.cliniccortex.com.br
   ACME_EMAIL=infra@cliniccortex.com.br
   WA_PROXY_HTTP_PORT=80
   WA_PROXY_HTTPS_PORT=443
   N8N_HOST_PORT=5678
   TEAM_SERVICE_HOST_PORT=3002
   ```

4. Os unicos arquivos reais de ambiente ficam na raiz:
   - `.env.local`
   - `.env.homolog`
   - `.env.production`

   Nenhum segredo operacional deve ficar em `deploy/hostinger/`.

5. Subir primeiro `team-service`:

   ```bash
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml up -d --build team-service
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml ps
   ```

6. Validar saude direta no host antes do proxy:

   ```bash
   curl -f http://127.0.0.1:3002/health
   curl -f "http://127.0.0.1:3002/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"
   ```

7. Se for manter `n8n` privado como fallback, subi-lo separadamente:

   ```bash
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml up -d n8n
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml ps
   ```

8. Subir o proxy:

   ```bash
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml up -d proxy
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml ps
   ```

9. Validar o proxy ainda na VPS:

   ```bash
   curl -f -H 'Host: wa-hml.cliniccortex.com.br' http://127.0.0.1/health/proxy
   curl -f -H 'Host: wa-hml.cliniccortex.com.br' http://127.0.0.1/health/team
   ```

   Se o `n8n` ainda estiver presente como fallback:

   ```bash
   curl -f -H 'Host: wa-hml.cliniccortex.com.br' http://127.0.0.1/health/n8n
   ```

10. So depois apontar DNS do host de homolog para a VPS.

11. Com DNS/SSL validos, validar o runtime publico do backend:

   ```bash
   curl -f "https://wa-hml.cliniccortex.com.br/health"
   curl -f "https://wa-hml.cliniccortex.com.br/whatsapp/meta/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test"
   ```

## Ajuste minimo no frontend

Quando a homolog estiver saudavel, o frontend de homolog deve usar:

```dotenv
VITE_INTERNAL_SERVICE_ORIGIN=https://wa-hml.cliniccortex.com.br
```

Para producao:

```dotenv
VITE_INTERNAL_SERVICE_ORIGIN=https://wa.cliniccortex.com.br
```

Nenhuma mudanca de contrato e necessaria.

## O que precisa ser testado quando o ambiente estiver no ar

### Infra basica

- `docker compose ps` mostra `proxy` e `team-service` como `healthy`
- `curl http://127.0.0.1:3002/health` responde `200`
- `curl -H 'Host: ...' http://127.0.0.1/health/proxy` responde `200`
- `curl -H 'Host: ...' http://127.0.0.1/health/team` responde `200`
- SSL do host `wa-*` emite certificado valido

Se o `n8n` estiver mantido como fallback:

- `curl http://127.0.0.1:5678/healthz` responde `200`
- `curl -H 'Host: ...' http://127.0.0.1/health/n8n` responde `200`

### Roteamento e runtime publico

- `GET /whatsapp/meta/webhook` responde challenge valido da Meta
- `/whatsapp/connections/status` responde pelo host `wa-*`
- `/whatsapp/connections/onboarding/session` responde pelo host `wa-*`
- `/whatsapp/connections/onboarding/complete` responde pelo host `wa-*`
- `POST http://127.0.0.1:3002/whatsapp/_drain` so e usado internamente
- `POST http://127.0.0.1:3002/whatsapp/agent/_drain` so e usado internamente

### Fluxo de aplicacao

- login no app continua funcionando
- telas de membership/plano continuam funcionando
- tela de integracao WhatsApp carrega sem erro de origem
- onboarding do WhatsApp abre o Embedded Signup
- callback da Meta volta para o app correto
- status da conexao da clinica atualiza depois do onboarding

### Fluxo operacional do WhatsApp

- webhook da Meta chega no `team-service`
- eventos sao persistidos no Supabase
- inbound real nao retorna `404/500`
- outbound real usa o backend Node
- nenhum request do app tenta chamar Edge Function
- `POST /whatsapp/meta/webhook` no `team-service` aceita payload assinado e enfileira eventos no Supabase
- workers sao ativados com `WHATSAPP_ENABLE_WORKERS=true`
- agent e ativado com `WHATSAPP_ENABLE_AGENT=true`

### Logs e rollback

- `docker logs` do `team-service` nao mostram erro de auth/repository
- `docker logs` do proxy nao mostram loops ou upstream `502`
- o DNS anterior e os envs atuais de frontend continuam anotados para rollback
- rollback curto consiste em reapontar `/whatsapp/*` para o `n8n`, se ele ainda estiver de pe

Se o `n8n` ainda existir como fallback:

- `docker logs` do `n8n` nao mostram erro de env ausente
- o backup do volume do `n8n` foi executado antes da remocao final do servico
