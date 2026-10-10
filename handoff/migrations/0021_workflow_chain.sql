-- The text a finished workflow passes to the next workflow in its group.
ALTER TABLE client_workflows ADD COLUMN last_output TEXT;
