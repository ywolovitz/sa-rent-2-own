-- History of which vehicle has been attached to which contract over time —
-- the source of truth for both directions of "vehicle moves between
-- contracts" and "a contract's vehicle changes mid-deal" (the same
-- relationship, just queried from either end). Mirrors the existing
-- vehicle_registrations (plate history) pattern: effective_to null = current.
--
-- contracts.vehicle_id remains the quick "current vehicle" pointer most of
-- the app already reads directly — kept in sync with this table's open row
-- by application code, same division of labor vehicle_registrations has
-- with vehicles today.
create table public.contract_vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  effective_from date not null default current_date,
  effective_to date,
  reason text,
  created_at timestamptz not null default now()
);

create index contract_vehicle_assignments_contract_id_idx
  on public.contract_vehicle_assignments (contract_id);
create index contract_vehicle_assignments_vehicle_id_idx
  on public.contract_vehicle_assignments (vehicle_id);

-- At most one open (current) assignment per contract, and per vehicle —
-- enforces "a vehicle belongs to one contract at a time" at the DB level.
create unique index contract_vehicle_assignments_one_open_per_contract
  on public.contract_vehicle_assignments (contract_id)
  where effective_to is null;
create unique index contract_vehicle_assignments_one_open_per_vehicle
  on public.contract_vehicle_assignments (vehicle_id)
  where effective_to is null;

alter table public.contract_vehicle_assignments enable row level security;

create policy contract_vehicle_assignments_manage on public.contract_vehicle_assignments
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- Bootstrap: one assignment row per existing contract, reflecting its
-- current vehicle_id. Where a vehicle already has more than one contract
-- row today, only the "current" one (its active contract, else the one
-- with the latest start_date) gets an open assignment — the rest get a
-- closed one as of their own end_date (or today, if that's null), since
-- otherwise this insert would itself violate the one-open-per-vehicle
-- constraint above. No deeper history beyond what's already in `contracts`
-- is assumed here — if older deal history becomes available later, it
-- slots in as additional closed rows with no schema change needed.
with ranked as (
  select
    id as contract_id,
    vehicle_id,
    start_date,
    end_date,
    row_number() over (
      partition by vehicle_id
      order by (status = 'active') desc, start_date desc, created_at desc
    ) as rn
  from public.contracts
)
insert into public.contract_vehicle_assignments (contract_id, vehicle_id, effective_from, effective_to)
select
  contract_id,
  vehicle_id,
  start_date,
  case when rn = 1 then null else coalesce(end_date, current_date) end
from ranked;
