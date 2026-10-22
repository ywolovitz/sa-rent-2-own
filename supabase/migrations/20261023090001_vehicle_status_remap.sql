-- Moves existing vehicles onto the new status set, using the raw status text
-- the original fleet import preserved verbatim in legacy_status_note
-- (e.g. "STR-DOV", "RENTAL-JAYDEN", "COURTESY CAR"). Requires
-- 20261023090000_vehicle_status_expand.sql to have been applied (and
-- committed) first.
--
-- Only vehicles currently `available` or `on_road` are touched — anything a
-- person has since set to another status by hand is left alone.

update public.vehicles
set status = 'str'
where status in ('available', 'on_road')
  and upper(trim(legacy_status_note)) like 'STR%';

update public.vehicles
set status = 'rental'
where status in ('available', 'on_road')
  and upper(trim(legacy_status_note)) like 'RENTAL%';

update public.vehicles
set status = 'courtesy'
where status in ('available', 'on_road')
  and upper(trim(legacy_status_note)) like 'COURTESY%';

-- `available` is retired; anything still on it (none expected after the
-- STR mapping above) becomes parked rather than being left on a dead status.
update public.vehicles
set status = 'parked'
where status = 'available';

-- New vehicles previously defaulted to the retired `available`.
alter table public.vehicles alter column status set default 'parked';
