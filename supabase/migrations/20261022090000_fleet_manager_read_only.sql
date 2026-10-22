-- Fleet Manager (the existing `manager` role) becomes read-only.
--
-- Until now `manager` could do everything `admin` could except manage
-- staff, via public.is_manager_or_admin() on every write policy. The client
-- wants a "Fleet Manager" who can view but never edit, so every write
-- policy now requires public.is_admin() instead; reads keep
-- is_manager_or_admin(). This is enforced here, at the database, not just
-- hidden in the UI.
--
-- Two shapes of change:
--   1. `for all` "manage" policies: tightened to is_admin() in place, plus a
--      new select-only policy so managers can still read the table.
--   2. Per-command policies (insert/update/delete): the is_manager_or_admin()
--      term is swapped for is_admin(); any technician-assignment clause in the
--      same policy is left exactly as it was.
--
-- Note: this is table/row-level enforcement. Hiding specific *fields* from a
-- Fleet Manager (purchase price, potential sale price, "Cash" payments,
-- outstanding balances, banking reveal) is done in the app's server code, so
-- that data is never sent to their browser — it is not enforced by RLS.

-- ---------------------------------------------------------------------------
-- 1. `for all` policies -> admin-only writes, manager read-only
-- ---------------------------------------------------------------------------

alter policy vehicle_assignments_manage on public.vehicle_assignments
  using (public.is_admin())
  with check (public.is_admin());
-- (vehicle_assignments_select already lets managers read.)

alter policy clients_manage on public.clients
  using (public.is_admin())
  with check (public.is_admin());
create policy clients_manager_select on public.clients
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy client_banking_details_manage on public.client_banking_details
  using (public.is_admin())
  with check (public.is_admin());
create policy client_banking_details_manager_select on public.client_banking_details
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy contracts_manage on public.contracts
  using (public.is_admin())
  with check (public.is_admin());
create policy contracts_manager_select on public.contracts
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy rental_payment_periods_manage on public.rental_payment_periods
  using (public.is_admin())
  with check (public.is_admin());
create policy rental_payment_periods_manager_select on public.rental_payment_periods
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy insurance_claims_manage on public.insurance_claims
  using (public.is_admin())
  with check (public.is_admin());
create policy insurance_claims_manager_select on public.insurance_claims
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy sale_listings_manage on public.sale_listings
  using (public.is_admin())
  with check (public.is_admin());
create policy sale_listings_manager_select on public.sale_listings
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy contract_vehicle_assignments_manage on public.contract_vehicle_assignments
  using (public.is_admin())
  with check (public.is_admin());
create policy contract_vehicle_assignments_manager_select on public.contract_vehicle_assignments
  for select to authenticated
  using (public.is_manager_or_admin());

alter policy payment_transactions_manage on public.payment_transactions
  using (public.is_admin())
  with check (public.is_admin());
create policy payment_transactions_manager_select on public.payment_transactions
  for select to authenticated
  using (public.is_manager_or_admin());

-- ---------------------------------------------------------------------------
-- 2. Per-command policies
-- ---------------------------------------------------------------------------

-- vehicles: admin, or a technician assigned to the vehicle (unchanged).
alter policy vehicles_update on public.vehicles
  using (
    public.is_admin()
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
    public.is_admin()
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

alter policy vehicles_insert_delete on public.vehicles
  with check (public.is_admin());

alter policy vehicles_delete on public.vehicles
  using (public.is_admin());

-- vehicle_registrations (plate history)
alter policy vehicle_registrations_manage on public.vehicle_registrations
  with check (public.is_admin());

alter policy vehicle_registrations_update on public.vehicle_registrations
  using (public.is_admin())
  with check (public.is_admin());

alter policy vehicle_registrations_delete on public.vehicle_registrations
  using (public.is_admin());

-- vehicle_costs: admin, or an assigned technician logging a cost (unchanged).
alter policy vehicle_costs_insert on public.vehicle_costs
  with check (
    public.is_admin()
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

alter policy vehicle_costs_update on public.vehicle_costs
  using (public.is_admin())
  with check (public.is_admin());

alter policy vehicle_costs_delete on public.vehicle_costs
  using (public.is_admin());

-- vehicle-invoices storage bucket
alter policy vehicle_invoices_insert on storage.objects
  with check (
    bucket_id = 'vehicle-invoices'
    and (
      public.is_admin()
      or (
        public.is_active_user(auth.uid())
        and exists (
          select 1 from public.vehicle_assignments va
          where va.vehicle_id::text = (storage.foldername(name))[1]
            and va.technician_id = auth.uid()
            and va.unassigned_at is null
        )
      )
    )
  );

alter policy vehicle_invoices_delete on storage.objects
  using (bucket_id = 'vehicle-invoices' and public.is_admin());
