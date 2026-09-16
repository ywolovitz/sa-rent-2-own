-- vehicles.assigned_to is a strict FK to a real staff account. Historical
-- data (and some ongoing cases — an external dealer, a contractor with no
-- login) names someone who isn't necessarily a profiles row. Add a
-- free-text fallback so that case doesn't get silently dropped.
alter table public.vehicles
  add column assigned_to_name text;

comment on column public.vehicles.assigned_to is
  'Linked staff account, when the assignee has a real profile.';
comment on column public.vehicles.assigned_to_name is
  'Free-text assignee name, used when there is no linked staff account (e.g. imported historical data, an external contractor).';
