# WhatsApp Cloud API Runbook

## Topologia suportada

- landing pública: `https://cliniccortex.com.br` e `https://www.cliniccortex.com.br`
- app autenticado: `https://app.cliniccortex.com.br`
- conector e webhook da Meta: `https://wa.cliniccortex.com.br`
- homolog: `https://app-hml.cliniccortex.com.br` e `https://wa-hml.cliniccortex.com.br`
- callback do Embedded Signup: `https://app.cliniccortex.com.br/integrations/whatsapp/meta/callback`
- webhook oficial: `https://wa.cliniccortex.com.br/whatsapp/meta/webhook`

O front foi ajustado para esse modelo. Em produção ele resolve o serviço interno de duas formas:

- principal: `VITE_INTERNAL_SERVICE_ORIGIN=https://wa.cliniccortex.com.br`
- fallback controlado: se a aplicação estiver em `app.cliniccortex.com.br` ou `app-hml.cliniccortex.com.br`, ela consegue derivar `wa.*` apenas como contingência

## Convenção de ambientes

- `local`
  - app: `http://app.localhost:3000`
  - landing: `http://localhost:3000`
  - conector: `http://localhost:3001`
  - compose: [docker-compose.yml](C:/Users/Usuário/Desktop/cliniccortex/docker-compose.yml)
  - env file: `.env.local`
- `homolog`
  - app: `https://app-hml.cliniccortex.com.br`
  - conector: `https://wa-hml.cliniccortex.com.br`
  - compose: [docker-compose.homolog.yml](C:/Users/Usuário/Desktop/cliniccortex/docker-compose.homolog.yml)
  - env file: `.env.homolog`
- `production`
  - app: `https://app.cliniccortex.com.br`
  - conector: `https://wa.cliniccortex.com.br`
  - compose: [docker-compose.production.yml](C:/Users/Usuário/Desktop/cliniccortex/docker-compose.production.yml)
  - env file: `.env.production`

Os arquivos `.env.local`, `.env.homolog` e `.env.production` foram criados na raiz do projeto e substituem o antigo `.env.example`.
O arquivo `.env` deixou de ser fonte de verdade operacional.

## Pré-condições

1. A ClinicCortex precisa ter acesso administrativo ao Business Manager que será dono do app integrador.
2. A migration [20260409_200000_meta_cloud_api_whatsapp.sql](C:/Users/Usuário/Desktop/cliniccortex/supabase/migrations/20260409_200000_meta_cloud_api_whatsapp.sql) precisa estar aplicada.
3. O domínio precisa permitir os dois subdomínios públicos:
   - `app.cliniccortex.com.br` na Vercel
   - `wa.cliniccortex.com.br` no VPS

## Variáveis obrigatórias

Preencha e ajuste o arquivo do ambiente correspondente:

- `APP_ENV=production`
- `VITE_APP_ENV=production`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_PUBLIC_LANDING_ORIGIN=https://cliniccortex.com.br`
- `VITE_PUBLIC_APP_ORIGIN=https://app.cliniccortex.com.br`
- `VITE_INTERNAL_SERVICE_ORIGIN=https://wa.cliniccortex.com.br`
- `PUBLIC_APP_ORIGIN=https://app.cliniccortex.com.br`
- `PUBLIC_WA_ORIGIN=https://wa.cliniccortex.com.br`
- `WA_PUBLIC_HOSTNAME=wa.cliniccortex.com.br`
- `ACME_EMAIL=<email-operacional>`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `META_EMBEDDED_SIGNUP_REDIRECT_URI=https://app.cliniccortex.com.br/integrations/whatsapp/meta/callback`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_WEBHOOK_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`

Geradores úteis:

- `pnpm whatsapp:generate-encryption-key`
- `pnpm whatsapp:generate-verify-token`

Regra operacional:

- `META_WEBHOOK_APP_SECRET` deve usar o mesmo segredo lógico do App Secret da Meta, a menos que você tenha um motivo forte para separar a configuração.
- `WHATSAPP_TOKEN_ENCRYPTION_KEY` precisa ser uma chave base64 de 32 bytes estável; trocar esse valor invalida a leitura dos tokens já cifrados no banco.
- o conector não faz mais autoload de `.env`; ele lê apenas `process.env`

## DNS e Vercel

1. Mantenha a landing pública em um projeto separado da Vercel para:
   - `cliniccortex.com.br`
   - `www.cliniccortex.com.br`
2. Mantenha o app autenticado em outro projeto da Vercel para:
   - `app.cliniccortex.com.br`
   - `app-hml.cliniccortex.com.br`
3. Crie no DNS:
   - `wa.cliniccortex.com.br`
   - `wa-hml.cliniccortex.com.br`
4. No projeto Vercel do app, configure:
   - `VITE_APP_ENV`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PUBLIC_LANDING_ORIGIN`
   - `VITE_PUBLIC_APP_ORIGIN`
   - `VITE_INTERNAL_SERVICE_ORIGIN`
5. Não é necessário rewrite da Vercel para `/api/whatsapp` se `VITE_INTERNAL_SERVICE_ORIGIN` estiver preenchido.

Observação importante:

- o callback do Embedded Signup é uma rota SPA já existente em [WhatsAppMetaCallback.tsx](C:/Users/Usuário/Desktop/cliniccortex/src/pages/WhatsAppMetaCallback.tsx)
- o host autenticado do produto deve permanecer em `app.cliniccortex.com.br` ou `app-hml.cliniccortex.com.br`
- a lógica em [appOrigin.ts](C:/Users/Usuário/Desktop/cliniccortex/src/lib/appOrigin.ts) agora usa env explícita como fonte principal e só recorre a inferência como fallback

## Publicação HTTPS do webhook

O arquivo [docker-compose.production.yml](C:/Users/Usuário/Desktop/cliniccortex/docker-compose.production.yml) foi ajustado para o stack de produção com:

- `wa-proxy` em Caddy com TLS automático
- `whatsapp-connector` exposto apenas em `127.0.0.1:3001`
- `n8n` exposto apenas em `127.0.0.1:5678`

O proxy TLS usa [docker/Caddyfile](C:/Users/Usuário/Desktop/cliniccortex/docker/Caddyfile) e publica:

- `GET /whatsapp/meta/webhook`
- `POST /whatsapp/meta/webhook`
- `/whatsapp/*`
- `/team/*`
- `/health`

No VPS:

1. copie o `.env` preenchido para a raiz do projeto
2. suba o stack:
   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
   ```
3. valide localmente no VPS:
   ```bash
   curl http://127.0.0.1:3001/health
   ```
4. valide publicamente:
   ```bash
   curl https://wa.cliniccortex.com.br/health
   ```

Critério de aceite:

- `https://wa.cliniccortex.com.br/health` retorna `{"ok":true}`
- a emissão do certificado TLS ocorre sem intervenção manual

Antes do onboarding real, rode o preflight do ambiente:

```bash
pnpm whatsapp:preflight:homolog
```

Depois que `wa-hml.cliniccortex.com.br` estiver público e o conector estiver de pé, valide os endpoints externos:

```bash
pnpm whatsapp:probe:homolog
```

## Configuração do app da Meta

No Meta for Developers:

1. crie um app do tipo `Business`
2. vincule o app ao Business Manager da ClinicCortex
3. adicione o produto `WhatsApp`
4. configure o webhook do produto com:
   - callback URL: `https://wa.cliniccortex.com.br/whatsapp/meta/webhook`
   - verify token: valor idêntico a `META_WEBHOOK_VERIFY_TOKEN`
5. crie a configuração do Embedded Signup e copie o `config_id`
6. registre como redirect URI permitida:
   - `https://app.cliniccortex.com.br/integrations/whatsapp/meta/callback`
7. confirme os escopos:
   - `business_management`
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`

## Onboarding real

1. abra a aplicação em `https://app.cliniccortex.com.br`
2. entre com um usuário que tenha acesso de gestão à clínica
3. vá até a etapa 7 do onboarding ou abra a modal de integração nas configurações
4. clique em `Conectar com Meta`
5. conclua o Embedded Signup com um número oficial válido
6. aguarde o retorno para `https://app.cliniccortex.com.br/integrations/whatsapp/meta/callback`

Validação de banco após o onboarding:

```sql
select
  id,
  clinic_id,
  provider,
  operational_status,
  onboarding_status,
  verification_status,
  webhook_status,
  business_account_id,
  waba_id,
  phone_number_id,
  display_phone_number,
  verified_name
from public.whatsapp_connections
order by updated_at desc
limit 10;
```

Resultado esperado:

- `provider = 'meta_cloud_api'`
- `operational_status = 'active'`
- `webhook_status = 'subscribed'`
- `waba_id` preenchido
- `phone_number_id` preenchido
- `display_phone_number` preenchido

Verifique também a presença de token cifrado:

```sql
select
  connection_id,
  token_obtained_at,
  token_expires_at,
  revoked_at
from public.whatsapp_connection_credentials
order by token_obtained_at desc
limit 10;
```

## Teste ponta a ponta

1. envie uma mensagem de um número externo para o número oficial conectado
2. confirme o recebimento do webhook:
   ```sql
   select
     id,
     event_kind,
     processing_status,
     received_at
   from public.whatsapp_webhook_events
   order by received_at desc
   limit 20;
   ```
3. confirme a persistência da mensagem:
   ```sql
   select
     id,
     connection_id,
     from_me,
     contact_wa_id,
     provider_message_id,
     provider_message_status,
     text_body,
     created_at
   from public.whatsapp_messages
   order by created_at desc
   limit 20;
   ```
4. confirme a atualização de status:
   ```sql
   select
     provider_message_id,
     status,
     occurred_at
   from public.whatsapp_message_status_events
   order by occurred_at desc
   limit 20;
   ```

Critério de aceite:

- inbound chega em `whatsapp_webhook_events`
- inbound cria `whatsapp_messages` com `from_me = false`
- o n8n recebe `contactWaId`
- o outbound cria `whatsapp_messages` com `from_me = true`
- os eventos de `sent`, `delivered` e `read` chegam via webhook oficial quando disponíveis

## Falhas esperadas

- sem acesso ao Business Manager da ClinicCortex, o setup do app para no painel da Meta
- sem `wa.cliniccortex.com.br` público e com TLS válido, a verificação do webhook falha
- sem `META_WEBHOOK_VERIFY_TOKEN` igual ao configurado na Meta, o `GET /whatsapp/meta/webhook` não valida
- sem `WHATSAPP_TOKEN_ENCRYPTION_KEY`, o conector não consegue persistir credenciais oficiais com segurança
- sem `VITE_PUBLIC_APP_ORIGIN`, `VITE_PUBLIC_LANDING_ORIGIN` e `VITE_INTERNAL_SERVICE_ORIGIN`, o frontend volta a depender de fallback e pode apontar para a origem errada em produção

## Serviço

- endpoint interno do conector: `http://127.0.0.1:3001`
- webhook oficial da Meta: `https://wa.cliniccortex.com.br/whatsapp/meta/webhook`
- frontend de produção: `https://app.cliniccortex.com.br`

## Comandos rápidos

- local:
  - `pnpm stack:local`
  - `pnpm whatsapp:dev`
  - `pnpm whatsapp:start:local`
  - `pnpm whatsapp:preflight:local`
- homolog:
  - `pnpm stack:homolog`
  - `pnpm build:homolog`
  - `pnpm whatsapp:start:homolog`
  - `pnpm whatsapp:preflight:homolog`
  - `pnpm whatsapp:probe:homolog`
- produção:
  - `pnpm stack:production`
  - `pnpm build:production`
  - `pnpm whatsapp:start:production`
  - `pnpm whatsapp:preflight:production`
  - `pnpm whatsapp:probe:production`

## Execução direta do conector

- `pnpm whatsapp:start` continua existindo apenas para runtime com variáveis já injetadas pelo processo ou pelo container
- para execução manual fora do Docker, use sempre:
  - `pnpm whatsapp:start:local`
  - `pnpm whatsapp:start:homolog`
  - `pnpm whatsapp:start:production`
