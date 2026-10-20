-- Deal number (the client's own "MAD..." deal reference) and statement
-- tag (the short per-deal label used in bank batch "statement description"
-- fields, e.g. "NEL" / "NEL2" on collision) — both free text, populated by
-- a one-off backfill script for existing contracts and set going forward
-- either manually or by the app's auto-generation rule.
alter table public.contracts
  add column deal_number text,
  add column statement_tag text;

create unique index contracts_deal_number_key
  on public.contracts (deal_number)
  where deal_number is not null;

create unique index contracts_statement_tag_key
  on public.contracts (statement_tag)
  where statement_tag is not null;

-- Debit-order collection status, independent of the overall contract
-- status — lets a specific contract's debit order be paused/stopped
-- without changing whether the contract itself is active.
create type public.billing_status as enum ('active', 'paused', 'stopped');

-- Generalizes str_deal_details' billing_day/direction/frequency onto every
-- contract (not just short_term_rental ones) — needed for any contract on
-- debit-order collection, which includes rent-to-own deals. billing_day is
-- nullable since not every contract has billing configured yet;
-- direction/frequency keep the same defaults str_deal_details used.
alter table public.contracts
  add column billing_day integer check (billing_day between 1 and 31),
  add column billing_direction public.billing_direction not null default 'arrears',
  add column billing_frequency public.billing_frequency not null default 'monthly',
  add column billing_status public.billing_status not null default 'active';

update public.contracts c
set billing_day = s.billing_day,
    billing_direction = s.billing_direction,
    billing_frequency = s.billing_frequency
from public.str_deal_details s
where c.id = s.contract_id;

-- str_deal_details' only columns now live directly on contracts — the
-- table has nothing left to hold.
drop table public.str_deal_details;
