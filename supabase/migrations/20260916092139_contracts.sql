-- A vehicle's "current client" is the client on its active contract, and
-- "past clients" are the clients on its completed/cancelled contracts.
-- There is deliberately no denormalized client field on vehicles.
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  contract_type public.contract_type not null default 'rent_to_own',
  start_date date not null default current_date,
  end_date date,
  status public.contract_status not null default 'active',
  payment_method public.payment_method not null default 'eft',
  installment_amount numeric(12, 2),
  purchase_price numeric(12, 2),
  potential_sale_price numeric(12, 2),
  sale_price numeric(12, 2),
  residual_value numeric(12, 2),
  total_collected numeric(12, 2) not null default 0,
  outstanding_balance numeric(12, 2) not null default 0,
  arrears_amount numeric(12, 2) not null default 0,
  is_paid_up boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contracts_vehicle_id_idx on public.contracts (vehicle_id);
create index contracts_client_id_idx on public.contracts (client_id);
create index contracts_status_idx on public.contracts (status);
create index contracts_end_date_idx on public.contracts (end_date);

-- At most one active contract per vehicle at a time (a vehicle can only be
-- actively rented out to one client under one deal at once).
create unique index contracts_one_active_per_vehicle
  on public.contracts (vehicle_id)
  where status = 'active';

create trigger set_contracts_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

create or replace view public.vehicle_current_contract
  with (security_invoker = true) as
select *
from public.contracts
where status = 'active';
