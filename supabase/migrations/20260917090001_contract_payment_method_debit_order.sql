-- Split into its own migration: a new enum value can't be used (e.g. as a
-- column default) in the same transaction that adds it.
alter type public.payment_method add value if not exists 'debit_order';
