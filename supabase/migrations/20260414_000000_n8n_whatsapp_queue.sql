alter table public.whatsapp_webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_worker text;

create index if not exists whatsapp_webhook_events_processing_idx
  on public.whatsapp_webhook_events(processing_status, received_at, processing_started_at);

create or replace function public.claim_whatsapp_webhook_events(
  batch_size integer default 10,
  worker_id text default null
)
returns setof public.whatsapp_webhook_events
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
    select event.id
    from public.whatsapp_webhook_events as event
    where
      event.processing_status = 'pending'
      or (
        event.processing_status = 'processing'
        and event.processing_started_at is not null
        and event.processing_started_at < timezone('utc', now()) - interval '10 minutes'
      )
      or (
        event.processing_status = 'failed'
        and coalesce(event.processing_attempts, 0) < 10
      )
    order by event.received_at asc
    limit effective_batch_size
    for update skip locked
  ),
  claimed_rows as (
    update public.whatsapp_webhook_events as event
    set
      processing_status = 'processing',
      processing_attempts = coalesce(event.processing_attempts, 0) + 1,
      processing_started_at = timezone('utc', now()),
      processing_worker = effective_worker,
      last_processing_error = null
    where event.id in (select id from candidate_rows)
    returning event.*
  )
  select *
  from claimed_rows
  order by received_at asc;
end;
$$;
