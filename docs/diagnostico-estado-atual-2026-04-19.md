# Diagnostico do Estado Atual do ClinicCortex

Data da fotografia: 2026-04-19  
Workspace analisado: `C:\Users\Usuário\Desktop\cliniccortex`  
Branch atual no workspace: `homolog`

Este documento substitui a fotografia anterior de 2026-04-18 como referencia principal para a tomada de decisao arquitetural. O foco aqui e descrever o estado atual do repositorio, das branches e do fluxo de WhatsApp, considerando o novo rumo decidido: descartar Edge Functions como runtime, convergir para `main` + `homolog`, consolidar o backend proprio e preparar o deploy final na Hostinger com `n8n`, backend Node e Supabase.

## Escopo

Este diagnostico cobre:

- estado das branches locais e remotas relevantes;
- divergencias entre elas;
- estado atual do fluxo de conexao com o WhatsApp em cada linha;
- situacao do runtime publico, do backend de apoio e do data plane;
- leitura arquitetural para o novo rumo definido;
- consolidacao recente dos arquivos de ambiente em `.env.local`, `.env.homolog` e `.env.production`.

## Resumo executivo

- A linha local mais avancada e operacionalmente relevante hoje e `homolog` em `ab8a2b6` (`feat: port whatsapp runtime into team service`).
- `origin/main` e `origin/homolog` continuam em `970d164`, ou seja, os remotos de deploy ainda estao quatro commits atras da linha local `homolog`.
- `main` local esta divergente (`ahead 1 / behind 2`) e nao representa a linha que deve guiar a consolidacao.
- O runtime publico de WhatsApp na linha ativa local agora e o backend Node:
  - `frontend /api/whatsapp/* -> team-service`
  - `wa.* /whatsapp/* -> team-service`
- `homolog` passa a concentrar tanto o caminho publico quanto a orquestracao interna do WhatsApp dentro do `team-service`.
- A branch `codex/archive-whatsapp-edge-experiment-2026-04-18` preserva a trilha Edge mais rica em logica, mas ela e experimental, contraditoria no roteamento e deve permanecer apenas como referencia tecnica.
- O repositorio atual ainda assume Supabase gerenciado por URL/chaves. Nao existem artefatos de self-host do Supabase na Hostinger versionados nesta linha.
- O layout antigo `deploy/hostinger/env/` foi aposentado em favor de tres arquivos canonicos na raiz:
  - `.env.local`
  - `.env.homolog`
  - `.env.production`
- `homolog` deve ser tratada como branch real de integracao; trabalho estrutural novo nao deve mais nascer em `codex/*`.

## Estado do workspace agora

### Branch e worktree

- Branch atual: `homolog`
- Status do worktree:
  - consolidacao do runtime WhatsApp em Node dentro do `team-service`
  - consolidacao dos arquivos de ambiente na raiz (`.env.local`, `.env.homolog`, `.env.production`)
  - remocao planejada do layout antigo `deploy/hostinger/env/`

### Observacao operacional importante

Os segredos operacionais deixaram de viver em arquivos tracked de exemplo. A regra agora e manter chaves reais apenas nos tres `.env.*` ignorados da raiz e derivar aliases de container no compose, evitando repetir segredo em `deploy/hostinger/`.

## Mapa atual de branches

### Branches locais

| Branch | SHA | Papel hoje | Runtime publico de WhatsApp | Destino sugerido |
| --- | --- | --- | --- | --- |
| `homolog` | `ab8a2b6` | linha local mais avancada; integra baseline Hostinger + runtime Node publico no `team-service` | `team-service` | permanente |
| `codex/whatsapp-node-inside-team-service` | `ab8a2b6` | duplicata exata da `homolog` | `team-service` | absorver/descartar depois da convergencia |
| `codex/hostinger-vps-n8n-only` | `539cecd` | baseline limpo de infraestrutura `n8n-only` para Hostinger | `n8n` | absorver e depois apagar |
| `codex/n8n-whatsapp-team-service` | `d089951` | primeira linha organizada do desenho `n8n + team-service` | `n8n` | historica; apagar depois |
| `codex/archive-whatsapp-edge-experiment-2026-04-18` | `7cfb0a3` | arquivo tecnico da trilha Edge | misto/contraditorio | manter so como referencia e apagar por ultimo |
| `main` | `d6aa38e` | branch local divergente, ainda presa ao conector antigo `whatsapp-service` | `whatsapp-service` | nao usar como base; reconciliar via `homolog` |

### Branches remotas relevantes

| Branch remota | SHA | Papel hoje | Observacao |
| --- | --- | --- | --- |
| `origin/main` | `970d164` | deploy remoto antigo | ainda no modelo do conector `whatsapp-service` |
| `origin/homolog` | `970d164` | homolog remota antiga | igual a `origin/main` |
| `origin/codex/n8n-whatsapp-team-service` | `d089951` | referencia remota da primeira linha `n8n-only` | ainda nao consolidada nos remotos de deploy |

## Divergencia entre as linhas principais

### `homolog` vs `origin/homolog`

`homolog` esta quatro commits a frente do remoto:

- `a0674b8 refactor: move whatsapp onboarding to n8n and extract team-service`
- `2322f6e chore: ignore supabase temp artifacts`
- `bd27c2c docs: add hostinger n8n-only deployment baseline`
- `ab8a2b6 feat: port whatsapp runtime into team service`

Leitura:

- a linha local `homolog` ja absorveu a migracao para `n8n`, a base de deploy Hostinger e uma implementacao Node interna do WhatsApp no `team-service`;
- nada disso ainda esta refletido em `origin/homolog`.

### `homolog` vs `main` local

`git rev-list --left-right --count homolog...main` retorna `6 1`.

Leitura:

- `main` local esta atras da consolidacao local em torno de seis commits relevantes;
- `main` local ainda carrega um commit proprio (`d6aa38e`) e ainda nao foi realinhada pela linha `homolog`.

### `main` local vs `origin/main`

`git rev-list --left-right --count origin/main...main` retorna `2 1`.

Leitura:

- `main` local nao esta nem alinhada com o remoto antigo nem com a linha nova;
- ela nao serve como base de decisao arquitetural neste momento.

## Diferencas estruturais por branch

### 1. `origin/main` e `origin/homolog` (`970d164`)

Estas duas branches remotas ainda representam o modelo antigo:

- existe um backend dedicado `whatsapp-service`;
- o frontend local proxia `/api/whatsapp` e `/api/team` para `http://localhost:3001`;
- `docker/nginx.conf` e `docker/Caddyfile` mandam `/whatsapp/*`, `/team/*` e `/health` para `whatsapp-connector:3001`;
- o frontend usa o contrato antigo do conector:
  - `POST /connections`
  - `GET /connections/by-clinic/:clinicId`
  - `GET /connections/by-clinic/:clinicId/status`
  - `POST /connections/by-clinic/:clinicId/onboarding/session`
  - `POST /connections/:connectionId/onboarding/complete`

Leitura:

- esta linha ainda e `connector-first`;
- `n8n` aparece como apoio opcional dentro do conector, nao como runtime publico principal;
- ela nao reflete mais a direcao atual do projeto.

### 2. `main` local (`d6aa38e`)

Operacionalmente, `main` local ainda segue a mesma familia de `origin/main`:

- mantem o `whatsapp-service` como dono publico de `/whatsapp/*`;
- mantem o contrato antigo do frontend para conexao WhatsApp;
- tem alteracoes paralelas em `.env`, `vercel.json` e `ProductDemoSection`, mas nao muda o desenho central do runtime.

Leitura:

- `main` local nao representa nem o passado remoto puro, nem a linha atual de migracao para Hostinger;
- ela e uma branch divergente e intermediaria, nao a branch para consolidar a arquitetura.

### 3. `codex/n8n-whatsapp-team-service` (`d089951`)

Foi a primeira linha limpa do desenho `n8n + team-service`:

- o conector Node antigo saiu do caminho publico;
- o frontend passou a falar com o contrato novo:
  - `POST /connections/onboarding/session`
  - `GET /connections/status?clinicId=...`
  - `POST /connections/onboarding/complete`
- `/api/whatsapp` e `/whatsapp/*` passaram a apontar para `n8n`;
- `team-service` permaneceu com:
  - `/team/*`
  - `/team/internal/auth/resolve`
  - `GET /whatsapp/meta/webhook`

Leitura:

- esta branch e a primeira fotografia coerente do desenho `n8n-only` como runtime publico;
- ainda nao traz a consolidacao Hostinger nem a porta Node interna do WhatsApp em `team-service`.

### 4. `codex/hostinger-vps-n8n-only` (`539cecd`)

Mantem o mesmo desenho funcional da branch anterior, mas adiciona a base operacional da Hostinger:

- `deploy/hostinger/*`
- `docs/hostinger-vps-n8n-only.md`
- envs de proxy, `team-service` e `n8n`
- compose e Caddy de VPS

Leitura:

- esta e a branch mais limpa para o desenho de infraestrutura `n8n-only`;
- ela ainda nao contem o runtime Node interno do WhatsApp dentro do `team-service`.

### 5. `codex/archive-whatsapp-edge-experiment-2026-04-18` (`7cfb0a3`)

Esta branch preserva a trilha Edge mais completa:

- `supabase/functions/whatsapp/index.ts`
- `handler.ts`
- `data.ts`
- `agent.ts`
- `shared.ts`
- testes Deno
- `supabase/config.toml`
- helper de acesso a clinica em `team-service/src/shared/clinicAccess.ts`

Mas o roteamento dela e contraditorio:

- `vite.config.ts` local aponta `/api/whatsapp` para `http://127.0.0.1:54321/functions/v1/whatsapp`;
- o `README` declara a Edge Function como caminho principal;
- ao mesmo tempo, `docker/Caddyfile` e `docker/nginx.conf` continuam mandando `/whatsapp/*` para `n8n`.

Leitura:

- esta branch e rica como fonte de codigo e modelagem;
- ela e fraca como baseline operacional;
- deve permanecer somente como referencia tecnica para extracao/port, nunca como runtime.

### 6. `homolog` e `codex/whatsapp-node-inside-team-service` (`ab8a2b6`)

Estas duas branches sao hoje equivalentes.

Elas combinam dois estados ao mesmo tempo:

1. **runtime publico atual**
   - `frontend /api/whatsapp/* -> team-service`
   - `wa.* /whatsapp/* -> team-service`
   - `GET /whatsapp/meta/webhook -> team-service`

2. **runtime Node candidato dentro do backend existente**
   - `team-service` agora tambem implementa:
     - `POST /whatsapp/connections/onboarding/session`
     - `GET /whatsapp/connections/status`
     - `POST /whatsapp/connections/onboarding/complete`
     - `GET /whatsapp/meta/webhook`
     - `POST /whatsapp/meta/webhook`
     - `POST /whatsapp/_drain`
     - `POST /whatsapp/agent/_drain`
     - `POST /whatsapp/messages/send`

Adicoes desta linha sobre `codex/hostinger-vps-n8n-only`:

- `team-service/src/modules/whatsapp/*`
- `team-service/src/integrations/meta/*`
- `team-service/src/supabase/WhatsAppRepository.ts`
- `team-service/src/modules/auth/clinicAccess.ts`
- migration `20260417_210000_whatsapp_agent_jobs.sql`

Leitura:

- `homolog` e hoje a branch local mais importante, mas ainda e hibrida;
- ela preserva o runtime publico em `n8n`, porem ja porta para Node a maior parte da trilha Edge que foi considerada util;
- isso e util para staging e consolidacao, mas ainda nao e o estado final decidido.

## Como o fluxo do WhatsApp funciona em cada branch

### Matriz resumida

| Branch | Frontend local `/api/whatsapp` | Runtime publico `/whatsapp/*` | `GET /whatsapp/meta/webhook` | `POST /whatsapp/meta/webhook` | Onboarding / status / complete | Orquestracao do agente e resposta | Data plane |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `origin/main` | `whatsapp-service` (`localhost:3001`) | `whatsapp-service` | `whatsapp-service` | `whatsapp-service` | `whatsapp-service` no contrato antigo | `whatsapp-service`, com handoff opcional para `n8n` | Supabase gerenciado |
| `origin/homolog` | `whatsapp-service` (`localhost:3001`) | `whatsapp-service` | `whatsapp-service` | `whatsapp-service` | `whatsapp-service` no contrato antigo | `whatsapp-service`, com handoff opcional para `n8n` | Supabase gerenciado |
| `main` local | `whatsapp-service` (`localhost:3001`) | `whatsapp-service` | `whatsapp-service` | `whatsapp-service` | `whatsapp-service` no contrato antigo | `whatsapp-service`, com handoff opcional para `n8n` | Supabase gerenciado |
| `codex/n8n-whatsapp-team-service` | `n8n` (`localhost:5678`) | `n8n` | `team-service` | `n8n` | `n8n` no contrato novo | `n8n` + Supabase | Supabase gerenciado |
| `codex/hostinger-vps-n8n-only` | `n8n` (`localhost:5678`) | `n8n` | `team-service` | `n8n` | `n8n` no contrato novo | `n8n` + Supabase | Supabase gerenciado |
| `codex/archive-whatsapp-edge-experiment-2026-04-18` | Edge Function local (`54321`) | publicamente ainda `n8n` | `team-service` | em codigo: Edge; em proxy publico: `n8n` | em codigo: Edge; em proxy publico: ambiguo | Edge + Supabase queues + Gemini | Supabase gerenciado |
| `homolog` | `n8n` (`localhost:5678`) | `n8n` | `team-service` | publicamente `n8n`; internamente tambem existe em `team-service` | publicamente `n8n`; internamente tambem existe em `team-service` | publicamente `n8n`; internamente `team-service` ja tem filas, sender e agent | Supabase gerenciado |
| `codex/whatsapp-node-inside-team-service` | igual a `homolog` | igual a `homolog` | igual a `homolog` | igual a `homolog` | igual a `homolog` | igual a `homolog` | Supabase gerenciado |

### Fluxo detalhado por familia de branch

#### A. Familia `origin/main` / `origin/homolog` / `main`

Fluxo:

1. O frontend fala com `wa.*` ou `/api/whatsapp`, que apontam para o `whatsapp-service`.
2. O `whatsapp-service` atende as rotas de onboarding, status, webhook e tambem `/team/*`.
3. O Supabase guarda conexoes, credenciais, status e eventos.
4. O `n8n` existe como apoio eventual, nao como runtime publico central.

Leitura:

- e um desenho antigo de conector dedicado;
- nao esta alinhado com a direcao atual de consolidar `n8n` + backend proprio dentro da VPS.

#### B. Familia `codex/n8n-whatsapp-team-service` / `codex/hostinger-vps-n8n-only`

Fluxo:

1. O frontend chama o contrato novo do WhatsApp.
2. `/api/whatsapp/*` e `wa.* /whatsapp/*` chegam ao `n8n`.
3. O `n8n` usa `TEAM_SERVICE_INTERNAL_URL` e `/team/internal/auth/resolve` para validar o acesso da sessao do usuario a clinica.
4. O `n8n` executa onboarding, consulta status e completa a conexao.
5. `GET /whatsapp/meta/webhook` fica no `team-service`.
6. Os dados continuam no Supabase.

Leitura:

- esta e a familia mais limpa para o desenho `n8n` como runtime publico do WhatsApp;
- o backend proprio ainda e de apoio, nao de orquestracao completa.

#### C. Familia `codex/archive-whatsapp-edge-experiment-2026-04-18`

Fluxo declarado no codigo e docs:

1. O frontend local chama a Edge Function.
2. A Edge Function atende onboarding, status, webhook, jobs e agent logic.
3. O Supabase continua como data plane e fila.
4. `team-service` segue como apoio para auth/acesso a clinica.

Fluxo real de proxy publico versionado:

1. O proxy publico `wa.* /whatsapp/*` ainda envia para `n8n`.
2. `GET /whatsapp/meta/webhook` continua no `team-service`.

Leitura:

- a branch mistura uma arquitetura Edge-first com uma infraestrutura ainda n8n-first;
- ela e util para extrair conhecimento e codigo, mas nao para operar.

#### D. Familia `homolog` / `codex/whatsapp-node-inside-team-service`

Fluxo atual efetivo:

1. O frontend continua chamando o contrato novo.
2. O proxy local e o proxy publico encaminham `/whatsapp/*` para o `team-service`.
3. `team-service` atende `/team/*`, `/team/internal/auth/resolve` e todo o contrato `/whatsapp/*`.

Fluxo interno consolidado:

1. O `team-service` ja consegue iniciar onboarding, consultar status, completar onboarding, receber webhook POST, drenar filas, enviar mensagens e processar o agente.
2. Essa logica foi portada para Node e para o backend existente.
3. O Supabase continua como persistencia, filas e fonte de verdade.

Leitura:

- a branch ja contem um backend proprio para o WhatsApp dentro do `team-service`;
- o runtime publico ja foi cortado para ele;
- a fase seguinte passa a ser estabilizacao, promocao para `main` e retirada gradual do `n8n` do stack critico.

## Diferencas de contrato do frontend

### Contrato antigo do conector (`main`, `origin/main`, `origin/homolog`)

- `POST /connections`
- `GET /connections/by-clinic/:clinicId`
- `GET /connections/by-clinic/:clinicId/status`
- `POST /connections/by-clinic/:clinicId/onboarding/session`
- `POST /connections/:connectionId/onboarding/complete`

### Contrato novo (`codex/n8n-whatsapp-team-service`, `codex/hostinger-vps-n8n-only`, `codex/archive-*`, `homolog`)

- `POST /connections/onboarding/session`
- `GET /connections/status?clinicId=...`
- `POST /connections/onboarding/complete`

Leitura:

- a linha local `homolog` e toda a familia `n8n-only` ja consolidaram o contrato novo;
- os remotos de deploy ainda estao presos ao contrato antigo.

## Estado do backend e do data plane

### Backend

- Hoje, o unico backend versionado e o `team-service`.
- Nas branches antigas, o papel de backend de WhatsApp estava em `whatsapp-service`.
- Nas branches `n8n-only`, o `team-service` virou backend de equipe/auth helper.
- Em `homolog`, o `team-service` ja acumula:
  - rotas de equipe;
  - auth/clinic access;
  - runtime Node candidato de WhatsApp.

### Data plane

Em todas as familias mais recentes relevantes, o Supabase continua como fonte de verdade para:

- `whatsapp_connections`
- `whatsapp_connection_credentials`
- `whatsapp_webhook_events`
- `whatsapp_messages`
- `whatsapp_message_status_events`
- `whatsapp_conversation_jobs`
- `whatsapp_agent_runs`

Tambem existem migrations para:

- base Meta Cloud API: `20260409_200000_meta_cloud_api_whatsapp.sql`
- fila/retry do fluxo n8n: `20260414_000000_n8n_whatsapp_queue.sql`
- jobs do agente: `20260417_210000_whatsapp_agent_jobs.sql`

### Lacuna importante para o objetivo Hostinger

Embora o rumo final mencionado seja colocar tambem o Supabase na Hostinger, o repositorio atual ainda nao contem:

- compose de Supabase self-hosted;
- volumes / backup / proxy para Supabase self-hosted;
- runbook de migracao do Supabase gerenciado para VPS.

Ou seja:

- hoje o codigo ainda descreve um Supabase remoto/gerenciado;
- a ida do Supabase para a Hostinger ainda e um programa futuro, nao um estado do repositorio.

## Leitura arquitetural com base no novo rumo

Com base no rumo agora declarado, a leitura objetiva do estado atual e:

1. **Edge Functions devem ser descartadas como runtime.**
   - A unica branch que as coloca como centro do desenho e a `codex/archive-whatsapp-edge-experiment-2026-04-18`.
   - Essa branch e contraditoria no roteamento e ja esta corretamente isolada como arquivo tecnico.

2. **A familia `n8n-only` foi o primeiro corte coerente para sair da ambiguidade.**
   - `codex/n8n-whatsapp-team-service` e `codex/hostinger-vps-n8n-only` alinham frontend, proxy e runtime publico em torno do `n8n`.

3. **`homolog` hoje esta mais avancada do que o rumo mais recente pede.**
   - Ela ja porta para Node, dentro do `team-service`, boa parte da trilha que veio da Edge.
   - Isso e tecnicamente valioso.
   - Mas, diante do novo rumo, ainda precisa de decisao sobre quanto dessa logica deve permanecer no backend proprio e quanto deve ser orquestrado pelo workflow do `n8n`.

4. **Os remotos de deploy estao desatualizados em relacao a tudo isso.**
   - `origin/main` e `origin/homolog` ainda estao na arquitetura antiga do `whatsapp-service`.

5. **O objetivo final de ficar com apenas duas branches permanentes faz sentido e ainda nao foi alcancado.**
   - Hoje a topologia local ainda depende de branches `codex/*` para entender a historia da migracao.

## Implicacoes objetivas para a proxima decisao arquitetural

Com base apenas no estado fotografado, as questoes em aberto sao:

### 1. O que fazer com o runtime Node ja portado em `homolog`

Hoje ele existe dentro do `team-service`, mas ainda nao e publico.

As opcoes objetivas sao:

- manter apenas a parte de backend proprio que faz sentido para apoio do `n8n`;
- ou seguir com o plano anterior e cortar o runtime publico de `/whatsapp/*` para o `team-service`.

Como o rumo agora e `n8n + backend proprio`, esta decisao precisa ser tomada explicitamente antes de convergir `homolog` -> `main`.

### 2. Como materializar o futuro Supabase na Hostinger

O repositorio ainda nao descreve esse estado. Portanto:

- hoje o projeto esta pronto para `Hostinger + n8n + team-service + proxy + Supabase remoto`;
- ele ainda nao esta pronto para `Hostinger + n8n + team-service + Supabase self-hosted`.

### 3. Como limpar as branches

Do ponto de vista do diagnostico, a ordem natural de descarte no futuro tende a ser:

1. `codex/whatsapp-node-inside-team-service` por ser duplicata da `homolog`;
2. `codex/hostinger-vps-n8n-only` depois que tudo util estiver absorvido em `homolog`;
3. `codex/n8n-whatsapp-team-service` depois que sua proveniencia estiver absorvida;
4. `codex/archive-whatsapp-edge-experiment-2026-04-18` por ultimo, depois que tudo util dela tiver sido traduzido para a linha real;
5. manter somente `homolog` e `main` como branches permanentes.

## Conclusao

O estado atual do ClinicCortex pode ser resumido assim:

- a historia antiga ainda esta em `main` / `origin/main` / `origin/homolog`, com `whatsapp-service` como conector publico;
- a primeira correcao de rumo esta em `codex/n8n-whatsapp-team-service` e `codex/hostinger-vps-n8n-only`, onde o WhatsApp publico passa a ser `n8n`;
- a branch local mais avancada e `homolog`, que mantem `n8n` como runtime publico, mas ja porta para Node dentro do `team-service` a maior parte da logica util trazida da trilha Edge;
- a branch Edge arquivada deve permanecer so como referencia tecnica;
- o repositorio ainda nao reflete self-host do Supabase na Hostinger;
- os remotos de deploy ainda estao atras da linha local;
- o objetivo de consolidar tudo em `homolog` e depois promover para `main`, deixando apenas essas duas branches permanentes, continua correto e ainda precisa ser executado.

Em termos prativos, hoje o projeto esta em um ponto de decisao entre tres camadas:

1. o legado antigo do `whatsapp-service`;
2. a linha `n8n-only` ja operacional;
3. a porta Node interna dentro do `team-service`.

O proximo passo arquitetural precisa escolher conscientemente o papel final do `team-service` nesse novo desenho, mantendo `n8n` como orquestrador oficial do fluxo de WhatsApp e usando a trilha Edge apenas como fonte de conhecimento, nao como runtime.
