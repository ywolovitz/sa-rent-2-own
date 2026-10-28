-- In-progress guided conversations on the staff WhatsApp bot (currently just
-- "Add a service"). One open flow per phone number; the webhook (service role)
-- reads and writes it, nobody else needs access, so RLS is on with no policies.
create table public.whatsapp_flows (
  phone text primary key,
  flow text not null,
  step text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_flows enable row level security;
