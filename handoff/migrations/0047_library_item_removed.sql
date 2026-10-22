-- A finished piece can leave the Library without deleting the files or the history.
-- removed_at set: hidden from the Library and from the Social lists.
-- A scheduled or live post still blocks removal. Put back clears removed_at.
ALTER TABLE deliverable_items ADD COLUMN removed_at INTEGER;
