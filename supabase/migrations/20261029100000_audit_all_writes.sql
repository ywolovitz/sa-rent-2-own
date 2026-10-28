-- Every write to business data is now logged with who did it.
--
-- Who: auth.uid() for anything done through the app (the signed-in user's own
-- session). Writes made with the service role (the WhatsApp bot, scripts) have
-- no auth.uid(), so they identify the person by setting two transaction-local
-- settings first: app.acting_user (a profiles.id, resolved from their cell
-- number) and app.acting_source ('whatsapp'). Anything with neither is logged
-- as source 'system' (imports, backfills, hand-run SQL).
alter table public.audit_log add column source text;

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
  v_actor uuid;
  v_source text;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_record_id := new.id;
    v_diff := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    -- A no-op update (nothing actually changed) isn't worth a log row.
    if to_jsonb(new) = to_jsonb(old) then
      return new;
    end if;
    v_action := 'update';
    v_record_id := new.id;
    v_diff := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
  else
    v_action := 'delete';
    v_record_id := old.id;
    v_diff := to_jsonb(old);
  end if;

  v_actor := coalesce(auth.uid(), nullif(current_setting('app.acting_user', true), '')::uuid);
  v_source := coalesce(
    nullif(current_setting('app.acting_source', true), ''),
    case when auth.uid() is not null then 'web' else 'system' end
  );

  insert into public.audit_log (table_name, record_id, action, changed_by, diff, source)
  values (tg_table_name, v_record_id, v_action, v_actor, v_diff, v_source);

  return coalesce(new, old);
end;
$$;

-- contracts, client_banking_details and vehicle_costs already have this trigger.
create trigger audit_vehicles
  after insert or update or delete on public.vehicles
  for each row execute function public.audit_row_change();
create trigger audit_clients
  after insert or update or delete on public.clients
  for each row execute function public.audit_row_change();
create trigger audit_vehicle_registrations
  after insert or update or delete on public.vehicle_registrations
  for each row execute function public.audit_row_change();
create trigger audit_contract_vehicle_assignments
  after insert or update or delete on public.contract_vehicle_assignments
  for each row execute function public.audit_row_change();
create trigger audit_rental_payment_periods
  after insert or update or delete on public.rental_payment_periods
  for each row execute function public.audit_row_change();
create trigger audit_payment_transactions
  after insert or update or delete on public.payment_transactions
  for each row execute function public.audit_row_change();
create trigger audit_vehicle_assignments
  after insert or update or delete on public.vehicle_assignments
  for each row execute function public.audit_row_change();
create trigger audit_insurance_claims
  after insert or update or delete on public.insurance_claims
  for each row execute function public.audit_row_change();
create trigger audit_sale_listings
  after insert or update or delete on public.sale_listings
  for each row execute function public.audit_row_change();
create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

-- "Add a service" over WhatsApp: the cost row and the vehicle update in one
-- transaction (they used to be two separate writes), attributed to the person
-- whose cell number sent the message. Service role only.
create or replace function public.whatsapp_save_service(
  p_user uuid,
  p_vehicle uuid,
  p_cost_date date,
  p_supplier text,
  p_amount numeric,
  p_mileage integer,
  p_work_done text,
  p_invoice text,
  p_next_km integer,
  p_next_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and is_active and role = 'admin') then
    raise exception 'not authorised';
  end if;

  perform set_config('app.acting_user', p_user::text, true);
  perform set_config('app.acting_source', 'whatsapp', true);

  insert into public.vehicle_costs (
    vehicle_id, cost_type, cost_date, supplier, amount, mileage_at_time,
    invoice_file_path, work_done, source, recorded_by
  ) values (
    p_vehicle, 'service', p_cost_date, p_supplier, p_amount, p_mileage,
    p_invoice, p_work_done, 'whatsapp', p_user
  );

  update public.vehicles
  set current_mileage = p_mileage, next_service_km = p_next_km, next_service_date = p_next_date
  where id = p_vehicle;
end;
$$;

revoke all on function public.whatsapp_save_service(uuid, uuid, date, text, numeric, integer, text, text, integer, date) from public, anon, authenticated;
grant execute on function public.whatsapp_save_service(uuid, uuid, date, text, numeric, integer, text, text, integer, date) to service_role;
