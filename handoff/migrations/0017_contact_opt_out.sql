-- A contact who asked this mailbox to stop. Default 0 still answers. opted_in stays unused.
ALTER TABLE contacts ADD COLUMN opted_out INTEGER NOT NULL DEFAULT 0 CHECK (opted_out IN (0, 1));
