create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action public.audit_action not null,
  changed_by uuid references public.profiles (id),
  diff jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_table_name_record_id_idx on public.audit_log (table_name, record_id);
create index audit_log_created_at_idx on public.audit_log (created_at);

-- Generic row-change auditor, attached to financially sensitive tables
-- below. Explicit "viewed banking details" reveal events are written
-- separately by the application, since a SELECT never fires a trigger.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.audit_action;
  v_record_id uuid;
  v_diff jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_record_id := new.id;
    v_diff := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_record_id := new.id;
    v_diff := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
  else
    v_action := 'delete';
    v_record_id := old.id;
    v_diff := to_jsonb(old);
  end if;

  insert into public.audit_log (table_name, record_id, action, changed_by, diff)
  values (tg_table_name, v_record_id, v_action, auth.uid(), v_diff);

  return coalesce(new, old);
end;
$$;

create trigger audit_contracts
  after insert or update or delete on public.contracts
  for each row execute function public.audit_row_change();

create trigger audit_client_banking_details
  after insert or update or delete on public.client_banking_details
  for each row execute function public.audit_row_change();

create trigger audit_vehicle_costs
  after insert or update or delete on public.vehicle_costs
  for each row execute function public.audit_row_change();
