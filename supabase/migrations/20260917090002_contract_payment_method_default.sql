-- New contracts default to debit order collection, matching how deals are
-- actually collected — existing contracts keep whatever payment method
-- they already have.
alter table public.contracts
  alter column payment_method set default 'debit_order';
