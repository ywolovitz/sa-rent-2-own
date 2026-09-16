-- Profiles extend auth.users with app-specific fields. Login happens via
-- phone number + password (auth.users.phone), email here is optional
-- metadata only and is never used to authenticate.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text not null,
  email text,
  role public.user_role not null default 'technician',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_phone_key on public.profiles (phone);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers used throughout RLS policies. security definer + a fixed
-- search_path so they can be called from policies without exposing the
-- profiles table to callers who shouldn't see other people's rows.
-- Returns null (not just the stored role) for a deactivated account, so
-- is_admin()/is_manager_or_admin() both fall through to false the moment
-- an admin flips is_active off — no separate "is this user active" check
-- needed at every call site.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_active_user(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = check_user_id and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'admin';
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin', 'manager');
$$;

-- Keeps profiles in sync whenever an account is created through the
-- Supabase Admin API. The admin-invite server action always passes
-- full_name/role via user_metadata; this trigger is the safety net so a
-- profile row always exists even if that call is ever bypassed.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'Unnamed user'),
    coalesce(new.phone, ''),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'technician')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Which vehicles a technician is currently responsible for. Drives both
-- the technician RLS scoping and the "assigned to" concept on vehicles.
create table public.vehicle_assignments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null,
  technician_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  created_at timestamptz not null default now()
);

create index vehicle_assignments_vehicle_id_idx on public.vehicle_assignments (vehicle_id);
create index vehicle_assignments_technician_id_idx on public.vehicle_assignments (technician_id);

-- Only one open (currently active) assignment per vehicle at a time.
create unique index vehicle_assignments_one_open_per_vehicle
  on public.vehicle_assignments (vehicle_id)
  where unassigned_at is null;
