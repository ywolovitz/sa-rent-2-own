-- Row Level Security for every table. Nothing here is exposed to the
-- `anon` role; policies are scoped to `authenticated` only, since this is
-- an invite-only internal tool with no public access.

alter table public.profiles enable row level security;
alter table public.vehicle_assignments enable row level security;
alter table public.clients enable row level security;
alter table public.client_banking_details enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_registrations enable row level security;
alter table public.vehicle_costs enable row level security;
alter table public.contracts enable row level security;
alter table public.str_deal_details enable row level security;
alter table public.rental_payment_periods enable row level security;
alter table public.insurance_claims enable row level security;
alter table public.sale_listings enable row level security;
alter table public.status_migration_map enable row level security;
alter table public.audit_log enable row level security;

-- profiles: everyone can see their own row; admin/manager can see the
-- whole staff list (needed for assigning technicians, nav, etc.).
-- Only admins can create/edit/deactivate accounts.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_manager_or_admin());

create policy profiles_admin_manage on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- vehicle_assignments: technicians see their own assignment history;
-- only admin/manager decide who's assigned to what.
create policy vehicle_assignments_select on public.vehicle_assignments
  for select to authenticated
  using (
    (technician_id = auth.uid() and public.is_active_user(auth.uid()))
    or public.is_manager_or_admin()
  );

create policy vehicle_assignments_manage on public.vehicle_assignments
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- clients: admin/manager only. Technicians don't need client data for
-- their job (assigned vehicles + cost/service logging).
create policy clients_manage on public.clients
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- client_banking_details: admin/manager only, no exceptions. Deliberately
-- no policy grants technicians any access here, so RLS denies them
-- outright rather than relying on the UI to hide it.
create policy client_banking_details_manage on public.client_banking_details
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- vehicles: admin/manager manage everything; a technician can see and
-- update (status, mileage, etc.) only the vehicles currently assigned to
-- them. Row-level only — see the Data Security guide note on always
-- re-checking authorization in Server Actions too, not just here.
create policy vehicles_select on public.vehicles
  for select to authenticated
  using (
    public.is_manager_or_admin()
    or (
      public.is_active_user(auth.uid())
      and exists (
        select 1 from public.vehicle_assignments va
        where va.vehicle_id = vehicles.id
          and va.technician_id = auth.uid()
          and va.unassigned_at is null
      )
    )
  );

create policy vehicles_update on public.vehicles
  for update to authenticated
  using (
    public.is_manager_or_admin()
    or (
      public.is_active_user(auth.uid())
      and exists (
        select 1 from public.vehicle_assignments va
        where va.vehicle_id = vehicles.id
          and va.technician_id = auth.uid()
          and va.unassigned_at is null
      )
    )
  )
  with check (
    public.is_manager_or_admin()
    or (
      public.is_active_user(auth.uid())
      and exists (
        select 1 from public.vehicle_assignments va
        where va.vehicle_id = vehicles.id
          and va.technician_id = auth.uid()
          and va.unassigned_at is null
      )
    )
  );

create policy vehicles_insert_delete on public.vehicles
  for insert to authenticated
  with check (public.is_manager_or_admin());

create policy vehicles_delete on public.vehicles
  for delete to authenticated
  using (public.is_manager_or_admin());

-- vehicle_registrations: same visibility as the vehicle itself; only
-- admin/manager record plate changes.
create policy vehicle_registrations_select on public.vehicle_registrations
  for select to authenticated
  using (
    public.is_manager_or_admin()
    or (
      public.is_active_user(auth.uid())
      and exists (
        select 1 from public.vehicle_assignments va
        where va.vehicle_id = vehicle_registrations.vehicle_id
          and va.technician_id = auth.uid()
          and va.unassigned_at is null
      )
    )
  );

create policy vehicle_registrations_manage on public.vehicle_registrations
  for insert to authenticated
  with check (public.is_manager_or_admin());

create policy vehicle_registrations_update on public.vehicle_registrations
  for update to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

create policy vehicle_registrations_delete on public.vehicle_registrations
  for delete to authenticated
  using (public.is_manager_or_admin());

-- vehicle_costs: a technician can log costs (service/repair/wash/etc.)
-- against a vehicle assigned to them, and see that vehicle's cost
-- history, but only admin/manager can edit or delete an entry after
-- the fact.
create policy vehicle_costs_select on public.vehicle_costs
  for select to authenticated
  using (
    public.is_manager_or_admin()
    or (
      public.is_active_user(auth.uid())
      and exists (
        select 1 from public.vehicle_assignments va
        where va.vehicle_id = vehicle_costs.vehicle_id
          and va.technician_id = auth.uid()
          and va.unassigned_at is null
      )
    )
  );

create policy vehicle_costs_insert on public.vehicle_costs
  for insert to authenticated
  with check (
    public.is_manager_or_admin()
    or (
      public.is_active_user(auth.uid())
      and exists (
        select 1 from public.vehicle_assignments va
        where va.vehicle_id = vehicle_costs.vehicle_id
          and va.technician_id = auth.uid()
          and va.unassigned_at is null
      )
    )
  );

create policy vehicle_costs_update on public.vehicle_costs
  for update to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

create policy vehicle_costs_delete on public.vehicle_costs
  for delete to authenticated
  using (public.is_manager_or_admin());

-- contracts, STR details, rental periods, insurance claims, sale
-- listings: admin/manager only. Technicians have no business need for
-- financial/contract data.
create policy contracts_manage on public.contracts
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

create policy str_deal_details_manage on public.str_deal_details
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

create policy rental_payment_periods_manage on public.rental_payment_periods
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

create policy insurance_claims_manage on public.insurance_claims
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

create policy sale_listings_manage on public.sale_listings
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- status_migration_map: one-off import tooling, admin only.
create policy status_migration_map_admin on public.status_migration_map
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- audit_log: admins can review the trail; nothing ever writes to it
-- directly through the API (rows are inserted by the security-definer
-- audit_row_change() trigger function, which runs as the table owner and
-- is therefore unaffected by these policies).
create policy audit_log_admin_select on public.audit_log
  for select to authenticated
  using (public.is_admin());
