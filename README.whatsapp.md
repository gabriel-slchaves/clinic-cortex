# WhatsApp QR Connector

## Pré-requisitos

1. Adicione `SUPABASE_SERVICE_ROLE_KEY` ao seu `.env`.
2. Aplique a migration em `supabase/migrations/20260402_120000_create_whatsapp_connections.sql`.

## Subir localmente

1. Rode `docker compose up -d --build`.
2. Abra a aplicação e entre no onboarding da clínica.
3. Vá para a etapa 7 em `/onboarding/7`.

## Testar a conexão

1. Clique em `Gerar QR Code`.
2. Escaneie o QR com o WhatsApp da clínica em `Dispositivos conectados`.
3. Aguarde o status mudar para `Conectado`.
4. Confirme no Supabase que a clínica ganhou um registro em `whatsapp_connections`.
5. Envie uma mensagem para o número conectado e confirme o registro mínimo em `whatsapp_messages`.

## Serviço

- Endpoint interno do conector: `http://localhost:3001/whatsapp`
- O frontend consome a rota proxied `/api/whatsapp/...`
- Sessões Baileys ficam persistidas no volume Docker `whatsapp_sessions`
