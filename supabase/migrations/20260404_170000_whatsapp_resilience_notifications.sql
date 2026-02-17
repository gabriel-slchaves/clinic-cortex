alter table public.whatsapp_connections
  add column if not exists manual_action_required boolean not null default false,
  add column if not exists is_recovering boolean not null default false,
  add column if not exists recovery_attempt_count integer not null default 0,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_event_code text,
  add column if not exists last_event_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_connections_recovery_attempt_count_check'
  ) then
    alter table public.whatsapp_connections
      add constraint whatsapp_connections_recovery_attempt_count_check
      check (recovery_attempt_count >= 0);
  end if;
end $$;

create index if not exists whatsapp_connections_manual_action_idx
  on public.whatsapp_connections (clinic_id, manual_action_required, updated_at desc)
  where deleted_at is null;

create table if not exists public.clinic_notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  kind text not null,
  severity text not null default 'info',
  title text not null,
  message text not null,
  dedupe_key text not null,
  active boolean not null default true,
  metadata jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clinic_notifications_dedupe_uidx
  on public.clinic_notifications (dedupe_key);

create index if not exists clinic_notifications_clinic_active_idx
  on public.clinic_notifications (clinic_id, active, updated_at desc);

drop trigger if exists clinic_notifications_set_updated_at on public.clinic_notifications;
create trigger clinic_notifications_set_updated_at
before update on public.clinic_notifications
for each row
execute procedure public.cc_set_updated_at();

alter table public.clinic_notifications enable row level security;

create policy "clinic_notifications_select"
on public.clinic_notifications
for select
using (
  exists (
    select 1
    from public.clinic_members m
    where m.clinic_id = clinic_notifications.clinic_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
  )
);
