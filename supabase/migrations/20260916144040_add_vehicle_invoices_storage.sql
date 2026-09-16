-- Private bucket for vehicle_costs invoice attachments. Objects are stored
-- as "<vehicle_id>/<filename>" so RLS can reuse the same
-- vehicle_assignments-based visibility rule as vehicle_costs itself,
-- without needing a join back to that table.
insert into storage.buckets (id, name, public)
values ('vehicle-invoices', 'vehicle-invoices', false)
on conflict (id) do nothing;

create policy vehicle_invoices_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vehicle-invoices'
    and (
      public.is_manager_or_admin()
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

create policy vehicle_invoices_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-invoices'
    and (
      public.is_manager_or_admin()
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

-- Only admin/manager can remove an invoice once uploaded, matching
-- vehicle_costs_delete.
create policy vehicle_invoices_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'vehicle-invoices' and public.is_manager_or_admin());
