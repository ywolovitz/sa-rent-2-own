-- A distinct "Rental" contract type, alongside rent_to_own and
-- short_term_rental, so the Contracts screen can count/filter Rentals
-- separately from STR. Nothing is migrated: existing contracts keep their
-- type, and Rental starts at zero until contracts are set to it.
alter type public.contract_type add value if not exists 'rental';
