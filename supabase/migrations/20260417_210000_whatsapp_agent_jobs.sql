create table if not exists public.whatsapp_conversation_jobs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  source_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  contact_wa_id text not null,
  job_kind text not null default 'generate_reply',
  status text not null default 'pending',
  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  cancelled_at timestamptz
);

create unique index if not exists whatsapp_conversation_jobs_source_unique
  on public.whatsapp_conversation_jobs(source_message_id, job_kind);

create index if not exists whatsapp_conversation_jobs_claim_idx
  on public.whatsapp_conversation_jobs(status, created_at, locked_at);

create table if not exists public.whatsapp_agent_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.whatsapp_conversation_jobs(id) on delete cascade,
  attempt_number integer not null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  connection_id uuid not null references public.whatsapp_connections(id) on delete cascade,
  source_message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  contact_wa_id text not null,
  decision text not null,
  model_provider text,
  model_name text,
  prompt_snapshot text,
  history_snapshot jsonb,
  request_payload jsonb,
  response_payload jsonb,
  reply_text text,
  handoff_reason text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create unique index if not exists whatsapp_agent_runs_attempt_unique
  on public.whatsapp_agent_runs(job_id, attempt_number);

create index if not exists whatsapp_agent_runs_source_idx
  on public.whatsapp_agent_runs(source_message_id, created_at desc);

alter table public.whatsapp_messages
  add column if not exists reply_to_message_id uuid references public.whatsapp_messages(id) on delete set null,
  add column if not exists origin_job_id uuid references public.whatsapp_conversation_jobs(id) on delete set null,
  add column if not exists agent_run_id uuid references public.whatsapp_agent_runs(id) on delete set null,
  add column if not exists send_state text;

create unique index if not exists whatsapp_messages_origin_job_unique
  on public.whatsapp_messages(origin_job_id)
  where origin_job_id is not null;

create index if not exists whatsapp_messages_conversation_history_idx
  on public.whatsapp_messages(clinic_id, connection_id, contact_wa_id, received_at desc);

create or replace function public.claim_whatsapp_conversation_jobs(
  batch_size integer default 10,
  worker_id text default null
)
returns setof public.whatsapp_conversation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  effective_batch_size integer := greatest(coalesce(batch_size, 10), 1);
  effective_worker text := coalesce(nullif(trim(worker_id), ''), gen_random_uuid()::text);
begin
  return query
  with candidate_rows as (
    select job.id
    from public.whatsapp_conversation_jobs as job
    where
      job.status = 'pending'
      or (
        job.status = 'processing'
        and job.locked_at is not null
        and job.locked_at < timezone('utc', now()) - interval '10 minutes'
      )
      or (
        job.status = 'failed'
        and coalesce(job.attempt_count, 0) < 10
      )
    order by job.created_at asc
    limit effective_batch_size
    for update skip locked
  ),
  claimed_rows as (
    update public.whatsapp_conversation_jobs as job
    set
      status = 'processing',
      attempt_count = coalesce(job.attempt_count, 0) + 1,
      locked_at = timezone('utc', now()),
      locked_by = effective_worker,
      last_error = null,
      updated_at = timezone('utc', now())
    where job.id in (select id from candidate_rows)
    returning job.*
  )
  select *
  from claimed_rows
  order by created_at asc;
end;
$$;
