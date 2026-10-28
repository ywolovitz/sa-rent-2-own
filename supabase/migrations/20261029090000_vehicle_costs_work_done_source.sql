-- Splits what used to be crammed into vehicle_costs.notes for entries logged
-- over WhatsApp: "what was done" gets its own column, and where the entry came
-- from becomes a proper field (who logged it is already recorded_by) instead of
-- a sentence in notes. notes goes back to being free-form.
alter table public.vehicle_costs
  add column work_done text,
  add column source text not null default 'web' check (source in ('web', 'whatsapp'));

-- Existing WhatsApp-logged rows: the first notes line was the work done (when
-- given), the "Logged via WhatsApp…" line is now implied by source.
update public.vehicle_costs
set source = 'whatsapp',
    work_done = nullif(split_part(notes, E'\nLogged via WhatsApp', 1), notes),
    notes = null
where notes like E'%Logged via WhatsApp by %' or notes like 'Logged via WhatsApp by %';
