-- 1:1 extension of contracts, only populated where contract_type = 'short_term_rental'.
create table public.str_deal_details (
  contract_id uuid primary key references public.contracts (id) on delete cascade,
  billing_day integer not null check (billing_day between 1 and 31),
  billing_direction public.billing_direction not null default 'arrears',
  billing_frequency public.billing_frequency not null default 'monthly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_str_deal_details_updated_at
  before update on public.str_deal_details
  for each row execute function public.set_updated_at();

-- Generalized per-period payment tracking. Populated first for STR deals
-- (reshaped from the STR DEALS pivot sheet), reusable later for
-- rent-to-own contracts if a full ledger is ever built out.
create table public.rental_payment_periods (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  period_label text not null,
  due_date date,
  status public.rental_period_status not null default 'upcoming',
  amount_due numeric(12, 2),
  amount_owed numeric(12, 2),
  paid_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index rental_payment_periods_contract_id_idx on public.rental_payment_periods (contract_id);
create unique index rental_payment_periods_contract_period_key
  on public.rental_payment_periods (contract_id, period_label);
