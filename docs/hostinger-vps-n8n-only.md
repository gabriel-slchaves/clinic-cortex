# Hostinger VPS: backend integrado Node sem `n8n` no stack operacional

Este runbook cobre a linha operacional atual:

- WhatsApp oficial no `team-service`
- `team-service` em Node como backend integrado
- Supabase como Auth/DB/Storage
- sem Edge Functions no runtime
- sem `n8n` no stack operacional da VPS

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

## Stack canonico da VPS

Na VPS, homolog e producao devem usar somente:

- `deploy/hostinger/docker-compose.yml`
- `deploy/hostinger/Caddyfile`

Os arquivos abaixo ficam fora do runbook da VPS:

- `docker-compose.homolog.yml`
- `docker-compose.production.yml`
- `docker/Caddyfile`

## Endpoints de health expostos

- `GET /health`
  - health publico do `team-service` via proxy
- `GET /health/proxy`
  - confirma que o Caddy respondeu
- `GET /health/team`
  - confirma que o proxy alcanca o `team-service`
- `GET http://127.0.0.1:3002/health`
  - health direto do `team-service` no host

## Observacao sobre a transicao do WhatsApp

Nesta fase, o `team-service` ja e o runtime publico de `/whatsapp/*`.

Regras desta etapa:

- `wa.* /whatsapp/* -> team-service`
- `wa.* /team/* -> team-service`
- `WHATSAPP_ENABLE_WORKERS` e `WHATSAPP_ENABLE_AGENT` precisam refletir o ambiente real antes do go-live

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

7. Subir o proxy:

   ```bash
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml up -d proxy
   docker compose --env-file .env.homolog -f deploy/hostinger/docker-compose.yml ps
   ```

8. Validar o proxy ainda na VPS:

   ```bash
   curl -fk -H 'Host: wa-hml.cliniccortex.com.br' https://127.0.0.1/health/proxy
   curl -fk -H 'Host: wa-hml.cliniccortex.com.br' https://127.0.0.1/health/team
   ```

9. So depois apontar DNS do host de homolog para a VPS.

10. Com DNS/SSL validos, validar o runtime publico do backend:

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
- `curl -fk -H 'Host: ...' https://127.0.0.1/health/proxy` responde `200`
- `curl -fk -H 'Host: ...' https://127.0.0.1/health/team` responde `200`
- SSL do host `wa-*` emite certificado valido
- `curl -i https://wa-hml.cliniccortex.com.br/` retorna `404`
- `curl -i https://wa-hml.cliniccortex.com.br/.git/config` retorna `404`
- `curl -i https://wa-hml.cliniccortex.com.br/.env` retorna `404`
- `curl -i https://wa-hml.cliniccortex.com.br/wp-config.php` retorna `404`

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

## Hardening minimo de host

Aplicar na VPS:

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Validar listeners publicos:

```bash
ss -lntp
```

Somente `80` e `443` devem estar expostos publicamente pelo compose operacional.
