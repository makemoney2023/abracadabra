-- Optional daily cap and blackout dates for the publishing cadence.
-- An empty object keeps the previous slot rules: no cap and no blackout.
ALTER TABLE social_autopost ADD COLUMN limits_json TEXT NOT NULL DEFAULT '{}';
