-- Extensions
create extension if not exists "pgcrypto" with schema extensions;

-- Enums
create type public.user_role as enum ('admin', 'manager', 'technician');

create type public.vehicle_status as enum (
  'available',
  'on_road',
  'parked',
  'in_repair',
  'for_sale',
  'sold',
  'written_off'
);

create type public.tracker_status as enum ('yes', 'no', 'no_info');

create type public.insurance_claim_status as enum ('none', 'pending', 'paid', 'denied');

create type public.contract_type as enum ('rent_to_own', 'short_term_rental', 'other');

create type public.contract_status as enum ('active', 'completed', 'cancelled', 'defaulted', 'repossessed');

create type public.payment_method as enum ('eft', 'cash', 'other');

create type public.billing_direction as enum ('advance', 'arrears');

create type public.billing_frequency as enum ('weekly', 'monthly');

create type public.rental_period_status as enum ('paid', 'owed', 'ended', 'upcoming');

create type public.vehicle_cost_type as enum ('service', 'repair', 'car_wash', 'maintenance', 'other');

create type public.bank_account_type as enum ('cheque', 'savings', 'other');

-- 'reveal' covers decrypting client_banking_details for display — a SELECT
-- never fires the audit_row_change() trigger, so that action is logged
-- explicitly by the application at the point of decryption.
create type public.audit_action as enum ('insert', 'update', 'delete', 'reveal');

-- updated_at trigger helper, reused by every table below that has an updated_at column
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Role helper functions (current_user_role/is_admin/is_manager_or_admin)
-- are defined in the profiles migration, since they query public.profiles
-- and a `language sql` function is validated against its referenced
-- objects at creation time.
