-- The Library file a social piece was scheduled from. One open piece per file.
ALTER TABLE deliverable_items ADD COLUMN source_file_id TEXT REFERENCES files(id);
