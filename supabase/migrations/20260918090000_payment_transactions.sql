-- Per-transaction debit-order ledger: one row per collection attempt
-- (receipt) or reversal (debit note), as opposed to rental_payment_periods'
-- hand-maintained per-period summary. Backfilled from the legacy system's
-- payment history export via scripts/backfill-payment-transactions.mjs,
-- matched to contracts by deal_number (same join key already backfilled
-- onto contracts — see 20260917090000_contract_deal_and_billing_fields.sql).
create type public.payment_transaction_type as enum ('receipt', 'debit_note');

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  transaction_date date not null,
  type public.payment_transaction_type not null,
  reference text not null,
  invoice_reference text not null,
  amount numeric(12, 2) not null,
  cash_effect numeric(12, 2) not null,
  reversal_reference text,
  reversed_transaction_id uuid references public.payment_transactions (id),
  source text not null default 'legacy_import',
  created_at timestamptz not null default now()
);

create index payment_transactions_contract_id_idx on public.payment_transactions (contract_id);
create index payment_transactions_invoice_reference_idx on public.payment_transactions (invoice_reference);
-- "reference" alone isn't globally unique in the source ledger — the same
-- debit-order reference can legitimately apply against two different
-- invoices in the same run (confirmed in the real export). The pair is.
create unique index payment_transactions_reference_invoice_key
  on public.payment_transactions (reference, invoice_reference);

alter table public.payment_transactions enable row level security;

-- Financial ledger — admin/manager only, same as contracts and
-- client_banking_details. No technician access.
create policy payment_transactions_manage on public.payment_transactions
  for all to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());
