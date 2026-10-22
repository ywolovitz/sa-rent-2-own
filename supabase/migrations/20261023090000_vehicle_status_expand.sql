-- New vehicle statuses: STR, Rental, Courtesy (fleet) and End of Deal
-- (end of contract). They sit alongside the existing on_road / parked /
-- in_repair / for_sale / sold / written_off.
--
-- This file ONLY adds the values. Postgres won't let a value added with
-- ALTER TYPE ... ADD VALUE be used until that transaction has committed, so
-- the data remap that uses them lives in the next migration
-- (20261023090001_vehicle_status_remap.sql) — apply this one first.
--
-- The retired `available` value is left in the enum (dropping an enum value
-- means rebuilding the type and every column using it); the app no longer
-- offers it and the next migration moves every vehicle off it.

alter type public.vehicle_status add value if not exists 'str';
alter type public.vehicle_status add value if not exists 'rental';
alter type public.vehicle_status add value if not exists 'courtesy';
alter type public.vehicle_status add value if not exists 'end_of_deal';
