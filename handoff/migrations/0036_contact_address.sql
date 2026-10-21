-- Optional postal address on a contact (staff and lead client agents can set it). Additive only, all NULL by default.
ALTER TABLE contacts ADD COLUMN address_line1 TEXT;
ALTER TABLE contacts ADD COLUMN address_line2 TEXT;
ALTER TABLE contacts ADD COLUMN city TEXT;
ALTER TABLE contacts ADD COLUMN region TEXT;
ALTER TABLE contacts ADD COLUMN postal_code TEXT;
ALTER TABLE contacts ADD COLUMN country TEXT;
