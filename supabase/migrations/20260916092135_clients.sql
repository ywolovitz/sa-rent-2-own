create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  id_number text,
  cell_number text not null,
  alt_cell_number text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_full_name_idx on public.clients using gin (to_tsvector('simple', full_name));
create index clients_cell_number_idx on public.clients (cell_number);

create trigger set_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- Banking details are encrypted application-side (AES-256-GCM) before they
-- ever reach Postgres. This table only ever stores ciphertext plus the
-- metadata (iv, key_version) needed to decrypt it server-side; it never
-- holds a usable plaintext account number. See RLS policies migration for
-- the technician-deny-all lockdown on this table.
create table public.client_banking_details (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  bank_name text not null,
  account_type public.bank_account_type not null default 'other',
  branch_code text,
  account_holder_name_encrypted text not null,
  account_holder_name_iv text not null,
  account_number_encrypted text not null,
  account_number_iv text not null,
  account_number_last4 text not null,
  key_version integer not null default 1,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index client_banking_details_client_id_key on public.client_banking_details (client_id);

create trigger set_client_banking_details_updated_at
  before update on public.client_banking_details
  for each row execute function public.set_updated_at();
