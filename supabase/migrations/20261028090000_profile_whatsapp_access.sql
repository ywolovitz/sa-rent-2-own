-- Per-person approval for the staff WhatsApp query bot. A phone number that
-- matches an active profile is NOT enough: an admin has to switch this on
-- for that person (Admin -> Users). Off by default.
alter table public.profiles
  add column whatsapp_enabled boolean not null default false;

-- Every message the WhatsApp bot receives or sends. Serves three jobs:
--  * audit trail (who asked what, what the bot answered);
--  * rate limiting and short conversation memory (read back by the webhook);
--  * dedupe of Twilio retries (unique inbound twilio_sid).
-- Written and read only by the webhook (service role); admins can read it.
-- Replies contain fleet data, so there is deliberately no policy for anyone else.
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  -- in:  received | answered | rejected | rate_limited | error
  -- out: answer | notice
  status text not null,
  body text not null,
  twilio_sid text,
  created_at timestamptz not null default now()
);

create index whatsapp_messages_phone_created_idx on public.whatsapp_messages (phone, created_at desc);
create unique index whatsapp_messages_inbound_sid_key
  on public.whatsapp_messages (twilio_sid) where direction = 'in' and twilio_sid is not null;

alter table public.whatsapp_messages enable row level security;

create policy whatsapp_messages_admin_select on public.whatsapp_messages
  for select to authenticated
  using (public.is_admin());
