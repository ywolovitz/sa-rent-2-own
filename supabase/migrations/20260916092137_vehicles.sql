create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  file_no text not null,
  make text,
  model text,
  year integer,
  colour text,
  vin text,
  engine_number text,
  status public.vehicle_status not null default 'available',
  legacy_status_note text,
  assigned_to uuid references public.profiles (id),
  current_mileage integer,
  next_service_km integer,
  next_service_date date,
  last_serviced_by text,
  tracker_supplier text,
  tracker_running public.tracker_status not null default 'no_info',
  natis_on_file boolean not null default false,
  license_disc_expiry date,
  has_spare_key boolean not null default false,
  warranty_active boolean not null default false,
  warranty_notes text,
  has_contract_file boolean not null default false,
  insurance_claim_status public.insurance_claim_status not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehicles_file_no_key on public.vehicles (file_no);
create index vehicles_status_idx on public.vehicles (status);
create index vehicles_assigned_to_idx on public.vehicles (assigned_to);

create trigger set_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- Now that vehicles exists, wire up the FK deferred from the profiles migration.
alter table public.vehicle_assignments
  add constraint vehicle_assignments_vehicle_id_fkey
  foreign key (vehicle_id) references public.vehicles (id) on delete cascade;

-- License plate history. Current-screen usage always joins to the row
-- where effective_to is null; historical plates stay queryable for audit
-- and to explain source-data anomalies like "JG52RVGP (JGN814MP)".
create table public.vehicle_registrations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  plate_number text not null,
  effective_from date not null default current_date,
  effective_to date,
  reason text,
  created_at timestamptz not null default now()
);

create index vehicle_registrations_vehicle_id_idx on public.vehicle_registrations (vehicle_id);
create index vehicle_registrations_plate_number_idx on public.vehicle_registrations (plate_number);

-- At most one open (current) registration per vehicle.
create unique index vehicle_registrations_one_open_per_vehicle
  on public.vehicle_registrations (vehicle_id)
  where effective_to is null;

create or replace view public.vehicle_current_registration
  with (security_invoker = true) as
select vehicle_id, plate_number, effective_from
from public.vehicle_registrations
where effective_to is null;
