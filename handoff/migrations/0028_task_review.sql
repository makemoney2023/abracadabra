-- Review column on the project board. Additive only: two nullable columns, no table rebuild.
-- A task sits in Review while review_requested_at is set and it is not done. Its stage is kept,
-- so "send back" knows where it came from. Existing rows stay NULL and keep their column.

ALTER TABLE tasks ADD COLUMN review_requested_at INTEGER;
ALTER TABLE tasks ADD COLUMN review_note TEXT;
