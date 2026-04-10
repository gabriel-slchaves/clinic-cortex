create extension if not exists pgcrypto;

create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null default 'meta_cloud_api',
  operational_status text not null default 'not_connected',
  onboarding_status text not null default 'not_started',
  verification_status text not null default 'unknown',
  webhook_status text not null default 'not_configured',
  business_account_id text,
  waba_id text,
  phone_number_id text,
  display_phone_number text,
  verified_name text,
  onboarding_state text,
  onboarding_started_at timestamptz,
  last_error text,
  last_event_code text,
  last_event_message text,
  last_event_at timestamptz,
  last_webhook_at timestamptz,
  connection_metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

alter table public.whatsapp_connections
  add column if not exists provider text not null default 'meta_cloud_api',
  add column if not exists operational_status text not null default 'not_connected',
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists verification_status text not null default 'unknown',
  add column if not exists webhook_status text not null default 'not_configured',
  add column if not exists business_account_id text,
  add column if not exists waba_id text,
  add column if not exists phone_number_id text,
  add column if not exists display_phone_number text,
  add column if not exists verified_name text,
  add column if not exists onboarding_state text,
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_event_code text,
  add column if not exists last_event_message text,
  add column if not exists last_event_at timestamptz,
  add column if not exists last_webhook_at timestamptz,
  add column if not exists connection_metadata jsonb,
  add column if not exists deleted_at timestamptz;

create unique index if not exists whatsapp_connections_clinic_id_unique
  on public.whatsapp_connections(clinic_id)
  where deleted_at is null;

create unique index if not exists whatsapp_connections_phone_number_id_unique
  on public.whatsapp_connections(phone_number_id)
  where deleted_at is null and phone_number_id is not null;

create table if not exists public.whatsapp_connection_credentials (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  encrypted_access_token text not null,
  granted_scopes text[],
  token_obtained_at timestamptz,
  token_expires_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists whatsapp_connection_credentials_connection_id_unique
  on public.whatsapp_connection_credentials(connection_id);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  clinic_id uuid references public.clinics(id) on delete set null,
  provider text not null default 'meta_cloud_api',
  provider_object text,
  provider_event_hash text not null,
  event_kind text not null,
  payload jsonb not null,
  received_at timestamptz not null default timezone('utc', now()),
  processing_status text not null default 'pending',
  processing_attempts integer not null default 0,
  last_processing_error text,
  processed_at timestamptz
);

create unique index if not exists whatsapp_webhook_events_hash_unique
  on public.whatsapp_webhook_events(provider_event_hash);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  provider text not null default 'meta_cloud_api',
  provider_message_id text,
  contact_wa_id text,
  from_me boolean not null default false,
  message_type text,
  text_body text,
  provider_message_status text,
  provider_timestamp timestamptz,
  conversation_category text,
  pricing_payload jsonb,
  error_code text,
  error_message text,
  raw_json jsonb,
  received_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.whatsapp_messages
  add column if not exists provider text not null default 'meta_cloud_api',
  add column if not exists provider_message_id text,
  add column if not exists contact_wa_id text,
  add column if not exists provider_message_status text,
  add column if not exists provider_timestamp timestamptz,
  add column if not exists conversation_category text,
  add column if not exists pricing_payload jsonb,
  add column if not exists error_code text,
  add column if not exists error_message text,
  add column if not exists raw_json jsonb,
  add column if not exists received_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_messages'
      and column_name = 'wa_message_id'
  ) then
    execute $backfill$
      update public.whatsapp_messages
      set provider_message_id = coalesce(provider_message_id, wa_message_id)
      where provider_message_id is null
        and wa_message_id is not null
    $backfill$;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_messages'
      and column_name = 'remote_jid'
  ) then
    execute $backfill$
      update public.whatsapp_messages
      set contact_wa_id = regexp_replace(split_part(coalesce(remote_jid, ''), '@', 1), ':.*$', '')
      where contact_wa_id is null
        and coalesce(remote_jid, '') <> ''
    $backfill$;
  end if;
end $$;

create unique index if not exists whatsapp_messages_provider_message_unique
  on public.whatsapp_messages(connection_id, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.whatsapp_message_status_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  provider text not null default 'meta_cloud_api',
  provider_message_id text not null,
  status text not null,
  conversation_category text,
  pricing_payload jsonb,
  error_code text,
  error_message text,
  raw_json jsonb,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists whatsapp_message_status_events_message_idx
  on public.whatsapp_message_status_events(connection_id, provider_message_id, occurred_at desc);

drop index if exists whatsapp_connections_manual_action_idx;

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_recovery_attempt_count_check;

alter table public.whatsapp_connections
  drop column if exists status,
  drop column if exists session_path,
  drop column if exists qr_code,
  drop column if exists qr_generated_at,
  drop column if exists phone_jid,
  drop column if exists phone_number,
  drop column if exists connected_at,
  drop column if exists last_seen_at,
  drop column if exists manual_action_required,
  drop column if exists is_recovering,
  drop column if exists recovery_attempt_count,
  drop column if exists next_retry_at;

alter table public.whatsapp_messages
  drop column if exists wa_message_id,
  drop column if exists remote_jid;
