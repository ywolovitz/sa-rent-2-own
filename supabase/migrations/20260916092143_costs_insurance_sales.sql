-- Doubles as the vehicle's service history log (cost_type = 'service')
-- as well as general maintenance/repair/wash spend, each with an
-- optional invoice attachment stored in Supabase Storage.
create table public.vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  cost_type public.vehicle_cost_type not null default 'other',
  cost_date date not null default current_date,
  supplier text,
  amount numeric(12, 2) not null,
  mileage_at_time integer,
  invoice_file_path text,
  notes text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index vehicle_costs_vehicle_id_idx on public.vehicle_costs (vehicle_id);
create index vehicle_costs_cost_date_idx on public.vehicle_costs (cost_date);

create table public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  claimant_name text,
  amount numeric(12, 2),
  filed_date date,
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index insurance_claims_vehicle_id_idx on public.insurance_claims (vehicle_id);

create trigger set_insurance_claims_updated_at
  before update on public.insurance_claims
  for each row execute function public.set_updated_at();

create table public.sale_listings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  spec text,
  condition text,
  mileage_at_listing integer,
  location text,
  dealer_price numeric(12, 2),
  listed_price numeric(12, 2),
  listed_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sale_listings_vehicle_id_idx on public.sale_listings (vehicle_id);

create trigger set_sale_listings_updated_at
  before update on public.sale_listings
  for each row execute function public.set_updated_at();

-- Import-time only. Used once to map the raw free-text STATUS values from
-- the source workbook to clean enum values before migration, then no
-- longer needed by the running application.
create table public.status_migration_map (
  raw_status text primary key,
  normalized_status public.vehicle_status not null,
  assigned_to text,
  contract_type public.contract_type,
  created_at timestamptz not null default now()
);
