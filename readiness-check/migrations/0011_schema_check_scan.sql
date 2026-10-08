-- Each schema result keeps the scan that produced the detailed report.
ALTER TABLE schema_check_sites ADD COLUMN scan_id TEXT;
